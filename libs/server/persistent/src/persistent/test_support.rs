use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
};

use async_trait::async_trait;
use uuid::Uuid;

use crate::domain::{
    normalize_sub_type, Diagram, DiagramDescription, DiagramEdge, DiagramEdges, DiagramNode,
    DiagramNodes, HasMany, HasOne, LogicalEntity, LogicalEntityDescription, LogicalRelationship,
    LogicalRelationshipDescription, Member, MemberDescription, Ref, ServerError, User,
    UserDescription, UserWorkspaces, Users, Workspace, WorkspaceDescription, WorkspaceDiagram,
    WorkspaceLogicalEntities, WorkspaceLogicalRelationships, WorkspaceMembers,
};

use super::store::{default_if_blank, now};

#[derive(Debug, Clone)]
struct UserRecord {
    id: String,
    name: String,
    email: Option<String>,
}

#[derive(Debug, Clone)]
struct WorkspaceRecord {
    id: String,
    title: String,
    description: Option<String>,
    status: String,
    metadata: HashMap<String, String>,
    created_at: String,
    updated_at: String,
    deleted_at: Option<String>,
}

#[derive(Debug, Clone)]
struct MemberRecord {
    id: String,
    workspace_id: String,
    user_id: String,
    role: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone)]
struct DiagramRecord {
    id: String,
    workspace_id: String,
    description: DiagramDescription,
    created_at: String,
    updated_at: String,
    deleted_at: Option<String>,
}

#[derive(Debug, Clone)]
struct LogicalEntityRecord {
    id: String,
    workspace_id: String,
    description: LogicalEntityDescription,
    created_at: String,
    updated_at: String,
    deleted_at: Option<String>,
}

#[derive(Debug, Clone)]
struct LogicalRelationshipRecord {
    id: String,
    workspace_id: String,
    description: LogicalRelationshipDescription,
    deleted_at: Option<String>,
}

#[derive(Default)]
struct FakeStore {
    users: HashMap<String, UserRecord>,
    workspaces: HashMap<String, WorkspaceRecord>,
    members: HashMap<String, MemberRecord>,
    diagrams: HashMap<String, DiagramRecord>,
    logical_entities: HashMap<String, LogicalEntityRecord>,
    logical_relationships: HashMap<String, LogicalRelationshipRecord>,
}

type SharedFakeStore = Arc<RwLock<FakeStore>>;

pub struct FakeUsers {
    store: SharedFakeStore,
    workspaces: Arc<FakeUserWorkspaces>,
}

impl FakeUsers {
    pub fn new() -> Self {
        let store = Arc::new(RwLock::new(FakeStore::default()));
        seed_defaults(&store);
        Self {
            store: store.clone(),
            workspaces: Arc::new(FakeUserWorkspaces::new(store, None)),
        }
    }
}

impl Default for FakeUsers {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Users for FakeUsers {
    fn workspaces(&self) -> &dyn UserWorkspaces {
        self.workspaces.as_ref()
    }

    async fn find_by_identity(&self, user_id: &str) -> Result<Option<User>, ServerError> {
        let record = self
            .store
            .read()
            .expect("fake store read lock poisoned")
            .users
            .get(user_id)
            .cloned();

        Ok(record.map(|record| {
            User::new(
                record.id,
                UserDescription {
                    name: record.name,
                    email: record.email,
                },
                Arc::new(FakeUserWorkspaces::new(
                    self.store.clone(),
                    Some(user_id.to_string()),
                )),
            )
        }))
    }
}

struct FakeUserWorkspaces {
    store: SharedFakeStore,
    user_id: Option<String>,
}

impl FakeUserWorkspaces {
    fn new(store: SharedFakeStore, user_id: Option<String>) -> Self {
        Self { store, user_id }
    }

    fn assemble(&self, record: WorkspaceRecord) -> Workspace {
        Workspace::new(
            record.id.clone(),
            WorkspaceDescription {
                title: record.title,
                description: record.description,
                status: record.status,
                metadata: record.metadata,
                created_at: record.created_at,
                updated_at: record.updated_at,
            },
            Arc::new(FakeWorkspaceMembers::new(
                self.store.clone(),
                record.id.clone(),
            )),
            Arc::new(FakeWorkspaceDiagrams::new(
                self.store.clone(),
                record.id.clone(),
            )),
            Arc::new(FakeWorkspaceLogicalEntities::new(
                self.store.clone(),
                record.id.clone(),
            )),
            Arc::new(FakeWorkspaceLogicalRelationships::new(
                self.store.clone(),
                record.id,
            )),
        )
    }

    fn visible_to_user(&self, store: &FakeStore, workspace_id: &str) -> bool {
        match &self.user_id {
            Some(user_id) => store
                .members
                .values()
                .any(|member| member.workspace_id == workspace_id && member.user_id == *user_id),
            None => true,
        }
    }

    fn matching_records(&self, store: &FakeStore, query: Option<&str>) -> Vec<WorkspaceRecord> {
        let query = query.map(str::to_lowercase);
        let mut rows = store
            .workspaces
            .values()
            .filter(|workspace| workspace.deleted_at.is_none())
            .filter(|workspace| self.visible_to_user(store, &workspace.id))
            .filter(|workspace| {
                query.as_ref().is_none_or(|query| {
                    workspace.title.to_lowercase().contains(query)
                        || workspace
                            .description
                            .as_deref()
                            .unwrap_or_default()
                            .to_lowercase()
                            .contains(query)
                })
            })
            .cloned()
            .collect::<Vec<_>>();

        rows.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        rows
    }
}

#[async_trait]
impl HasMany<Workspace> for FakeUserWorkspaces {
    async fn find_all(&self, from: usize, to: usize) -> Result<Vec<Workspace>, ServerError> {
        let store = self.store.read().expect("fake store read lock poisoned");
        Ok(self
            .matching_records(&store, None)
            .into_iter()
            .skip(from)
            .take(to.saturating_sub(from))
            .map(|record| self.assemble(record))
            .collect())
    }

    async fn find_by_identity(&self, id: &str) -> Result<Option<Workspace>, ServerError> {
        let store = self.store.read().expect("fake store read lock poisoned");
        Ok(store
            .workspaces
            .get(id)
            .filter(|workspace| workspace.deleted_at.is_none())
            .filter(|workspace| self.visible_to_user(&store, &workspace.id))
            .cloned()
            .map(|record| self.assemble(record)))
    }

    async fn size(&self) -> Result<usize, ServerError> {
        let store = self.store.read().expect("fake store read lock poisoned");
        Ok(self.matching_records(&store, None).len())
    }
}

#[async_trait]
impl UserWorkspaces for FakeUserWorkspaces {
    async fn list(
        &self,
        page: u32,
        page_size: u32,
        query: Option<String>,
    ) -> Result<(Vec<Workspace>, u64), ServerError> {
        if page == 0 || page_size == 0 {
            return Err(ServerError::Validation(
                "page and pageSize must be greater than 0".to_string(),
            ));
        }

        let store = self.store.read().expect("fake store read lock poisoned");
        let rows = self.matching_records(&store, query.as_deref());
        let total = rows.len() as u64;
        let offset = ((page - 1) * page_size) as usize;
        let workspaces = rows
            .into_iter()
            .skip(offset)
            .take(page_size as usize)
            .map(|record| self.assemble(record))
            .collect();

        Ok((workspaces, total))
    }

    async fn create(&self, desc: WorkspaceDescription) -> Result<Workspace, ServerError> {
        let id = Uuid::new_v4().to_string();
        let timestamp = now();
        let record = WorkspaceRecord {
            id: id.clone(),
            title: normalize_title(desc.title)?,
            description: desc.description,
            status: default_if_blank(desc.status, "active"),
            metadata: desc.metadata,
            created_at: timestamp.clone(),
            updated_at: timestamp.clone(),
            deleted_at: None,
        };

        let mut store = self.store.write().expect("fake store write lock poisoned");
        store.workspaces.insert(id.clone(), record.clone());

        if let Some(user_id) = &self.user_id {
            let member_id = Uuid::new_v4().to_string();
            store.members.insert(
                member_id.clone(),
                MemberRecord {
                    id: member_id,
                    workspace_id: id,
                    user_id: user_id.clone(),
                    role: "owner".to_string(),
                    created_at: timestamp.clone(),
                    updated_at: timestamp,
                },
            );
        }

        Ok(self.assemble(record))
    }

    async fn update(&self, id: &str, desc: WorkspaceDescription) -> Result<Workspace, ServerError> {
        let mut store = self.store.write().expect("fake store write lock poisoned");
        if !self.visible_to_user(&store, id) {
            return Err(ServerError::NotFound(format!("workspace {id} not found")));
        }

        let workspace = store
            .workspaces
            .get_mut(id)
            .filter(|workspace| workspace.deleted_at.is_none())
            .ok_or_else(|| ServerError::NotFound(format!("workspace {id} not found")))?;

        workspace.title = normalize_title(desc.title)?;
        workspace.description = desc.description;
        workspace.status = default_if_blank(desc.status, "active");
        workspace.metadata = desc.metadata;
        workspace.updated_at = now();

        Ok(self.assemble(workspace.clone()))
    }

    async fn delete(&self, id: &str) -> Result<(), ServerError> {
        let mut store = self.store.write().expect("fake store write lock poisoned");
        if !self.visible_to_user(&store, id) {
            return Err(ServerError::NotFound(format!("workspace {id} not found")));
        }

        let workspace = store
            .workspaces
            .get_mut(id)
            .filter(|workspace| workspace.deleted_at.is_none())
            .ok_or_else(|| ServerError::NotFound(format!("workspace {id} not found")))?;
        let timestamp = now();
        workspace.deleted_at = Some(timestamp.clone());
        workspace.updated_at = timestamp;
        Ok(())
    }
}

struct FakeWorkspaceDiagrams {
    store: SharedFakeStore,
    workspace_id: String,
}

impl FakeWorkspaceDiagrams {
    fn new(store: SharedFakeStore, workspace_id: String) -> Self {
        Self {
            store,
            workspace_id,
        }
    }

    fn assemble(&self, record: DiagramRecord) -> Diagram {
        let mut description = record.description;
        description.workspace = Ref::new(record.workspace_id);
        description.created_at = record.created_at;
        description.updated_at = record.updated_at;
        Diagram::new(
            record.id,
            description,
            Arc::new(FakeDiagramNodes),
            Arc::new(FakeDiagramEdges),
        )
    }

    fn default_record(&self) -> DiagramRecord {
        let timestamp = now();
        DiagramRecord {
            id: "model".to_string(),
            workspace_id: self.workspace_id.clone(),
            description: DiagramDescription {
                workspace: Ref::new(self.workspace_id.clone()),
                title: "Model".to_string(),
                viewport: Default::default(),
                created_at: timestamp.clone(),
                updated_at: timestamp.clone(),
            },
            created_at: timestamp.clone(),
            updated_at: timestamp,
            deleted_at: None,
        }
    }

    fn matching_records(&self, store: &FakeStore) -> Vec<DiagramRecord> {
        let mut rows = store
            .diagrams
            .values()
            .filter(|diagram| diagram.workspace_id == self.workspace_id)
            .filter(|diagram| diagram.deleted_at.is_none())
            .cloned()
            .collect::<Vec<_>>();
        rows.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        rows
    }
}

#[async_trait]
impl HasOne<Diagram> for FakeWorkspaceDiagrams {
    async fn get(&self) -> Result<Diagram, ServerError> {
        let store = self.store.read().expect("fake store read lock poisoned");
        let record = self
            .matching_records(&store)
            .into_iter()
            .next()
            .unwrap_or_else(|| self.default_record());
        Ok(self.assemble(record))
    }
}

impl WorkspaceDiagram for FakeWorkspaceDiagrams {}

struct FakeWorkspaceLogicalEntities {
    store: SharedFakeStore,
    workspace_id: String,
}

impl FakeWorkspaceLogicalEntities {
    fn new(store: SharedFakeStore, workspace_id: String) -> Self {
        Self {
            store,
            workspace_id,
        }
    }

    fn assemble(&self, record: LogicalEntityRecord) -> LogicalEntity {
        let mut description = record.description;
        description.workspace = Ref::new(record.workspace_id);
        description.created_at = record.created_at;
        description.updated_at = record.updated_at;
        LogicalEntity::new(record.id, description)
    }

    fn matching_records(&self, store: &FakeStore) -> Vec<LogicalEntityRecord> {
        let mut rows = store
            .logical_entities
            .values()
            .filter(|entity| entity.workspace_id == self.workspace_id)
            .filter(|entity| entity.deleted_at.is_none())
            .cloned()
            .collect::<Vec<_>>();
        rows.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        rows
    }
}

#[async_trait]
impl HasMany<LogicalEntity> for FakeWorkspaceLogicalEntities {
    async fn find_all(&self, from: usize, to: usize) -> Result<Vec<LogicalEntity>, ServerError> {
        let store = self.store.read().expect("fake store read lock poisoned");
        Ok(self
            .matching_records(&store)
            .into_iter()
            .skip(from)
            .take(to.saturating_sub(from))
            .map(|record| self.assemble(record))
            .collect())
    }

    async fn find_by_identity(&self, id: &str) -> Result<Option<LogicalEntity>, ServerError> {
        let store = self.store.read().expect("fake store read lock poisoned");
        Ok(store
            .logical_entities
            .get(id)
            .filter(|entity| entity.workspace_id == self.workspace_id)
            .filter(|entity| entity.deleted_at.is_none())
            .cloned()
            .map(|record| self.assemble(record)))
    }

    async fn size(&self) -> Result<usize, ServerError> {
        let store = self.store.read().expect("fake store read lock poisoned");
        Ok(self.matching_records(&store).len())
    }
}

#[async_trait]
impl WorkspaceLogicalEntities for FakeWorkspaceLogicalEntities {
    async fn add(&self, desc: LogicalEntityDescription) -> Result<LogicalEntity, ServerError> {
        if desc.name.trim().is_empty() {
            return Err(ServerError::Validation(
                "logical entity name must not be empty".to_string(),
            ));
        }
        let timestamp = now();
        let id = Uuid::new_v4().to_string();
        let mut description = desc;
        description.workspace = Ref::new(self.workspace_id.clone());
        description.sub_type = normalize_sub_type(&description.entity_type, description.sub_type)?;
        description.name = description.name.trim().to_string();
        description.created_at = timestamp.clone();
        description.updated_at = timestamp.clone();
        let record = LogicalEntityRecord {
            id: id.clone(),
            workspace_id: self.workspace_id.clone(),
            description,
            created_at: timestamp.clone(),
            updated_at: timestamp,
            deleted_at: None,
        };
        self.store
            .write()
            .expect("fake store write lock poisoned")
            .logical_entities
            .insert(id, record.clone());
        Ok(self.assemble(record))
    }

    async fn update(
        &self,
        entity_id: &str,
        desc: LogicalEntityDescription,
    ) -> Result<LogicalEntity, ServerError> {
        if desc.name.trim().is_empty() {
            return Err(ServerError::Validation(
                "logical entity name must not be empty".to_string(),
            ));
        }
        let mut store = self.store.write().expect("fake store write lock poisoned");
        let record = store
            .logical_entities
            .get_mut(entity_id)
            .filter(|entity| entity.workspace_id == self.workspace_id)
            .filter(|entity| entity.deleted_at.is_none())
            .ok_or_else(|| {
                ServerError::NotFound(format!("logical entity {entity_id} not found"))
            })?;
        let timestamp = now();
        let mut description = desc;
        description.workspace = Ref::new(record.workspace_id.clone());
        description.sub_type = normalize_sub_type(&description.entity_type, description.sub_type)?;
        description.name = description.name.trim().to_string();
        description.created_at = record.created_at.clone();
        description.updated_at = timestamp.clone();
        record.description = description;
        record.updated_at = timestamp;
        Ok(self.assemble(record.clone()))
    }

    async fn delete(&self, entity_id: &str) -> Result<(), ServerError> {
        let mut store = self.store.write().expect("fake store write lock poisoned");
        let entity = store
            .logical_entities
            .get_mut(entity_id)
            .filter(|entity| entity.workspace_id == self.workspace_id)
            .filter(|entity| entity.deleted_at.is_none())
            .ok_or_else(|| {
                ServerError::NotFound(format!("logical entity {entity_id} not found"))
            })?;
        let timestamp = now();
        entity.deleted_at = Some(timestamp.clone());
        entity.updated_at = timestamp;
        Ok(())
    }

    async fn list(
        &self,
        page: u32,
        page_size: u32,
    ) -> Result<(Vec<LogicalEntity>, u64), ServerError> {
        if page == 0 || page_size == 0 {
            return Err(ServerError::Validation(
                "page and pageSize must be greater than 0".to_string(),
            ));
        }
        let store = self.store.read().expect("fake store read lock poisoned");
        let rows = self.matching_records(&store);
        let total = rows.len() as u64;
        let offset = ((page - 1) * page_size) as usize;
        Ok((
            rows.into_iter()
                .skip(offset)
                .take(page_size as usize)
                .map(|record| self.assemble(record))
                .collect(),
            total,
        ))
    }
}

struct FakeWorkspaceLogicalRelationships {
    store: SharedFakeStore,
    workspace_id: String,
}

impl FakeWorkspaceLogicalRelationships {
    fn new(store: SharedFakeStore, workspace_id: String) -> Self {
        Self {
            store,
            workspace_id,
        }
    }

    fn assemble(&self, record: LogicalRelationshipRecord) -> LogicalRelationship {
        let mut description = record.description;
        description.workspace = Ref::new(record.workspace_id);
        LogicalRelationship::new(record.id, description)
    }

    fn matching_records(&self, store: &FakeStore) -> Vec<LogicalRelationshipRecord> {
        let mut rows = store
            .logical_relationships
            .values()
            .filter(|relationship| relationship.workspace_id == self.workspace_id)
            .filter(|relationship| relationship.deleted_at.is_none())
            .cloned()
            .collect::<Vec<_>>();
        rows.sort_by(|left, right| right.id.cmp(&left.id));
        rows
    }

    fn endpoint_exists(&self, store: &FakeStore, entity_id: &str) -> bool {
        store
            .logical_entities
            .get(entity_id)
            .filter(|entity| entity.workspace_id == self.workspace_id)
            .filter(|entity| entity.deleted_at.is_none())
            .is_some()
    }

    fn validate_description(
        &self,
        store: &FakeStore,
        desc: &LogicalRelationshipDescription,
    ) -> Result<(), ServerError> {
        for (label, endpoint_id) in [("source", desc.source.id()), ("target", desc.target.id())] {
            if !self.endpoint_exists(store, endpoint_id) {
                return Err(ServerError::Validation(format!(
                    "logical relationship {label} endpoint {endpoint_id} not found in workspace {}",
                    self.workspace_id
                )));
            }
        }
        Ok(())
    }
}

#[async_trait]
impl HasMany<LogicalRelationship> for FakeWorkspaceLogicalRelationships {
    async fn find_all(
        &self,
        from: usize,
        to: usize,
    ) -> Result<Vec<LogicalRelationship>, ServerError> {
        let store = self.store.read().expect("fake store read lock poisoned");
        Ok(self
            .matching_records(&store)
            .into_iter()
            .skip(from)
            .take(to.saturating_sub(from))
            .map(|record| self.assemble(record))
            .collect())
    }

    async fn find_by_identity(&self, id: &str) -> Result<Option<LogicalRelationship>, ServerError> {
        let store = self.store.read().expect("fake store read lock poisoned");
        Ok(store
            .logical_relationships
            .get(id)
            .filter(|relationship| relationship.workspace_id == self.workspace_id)
            .filter(|relationship| relationship.deleted_at.is_none())
            .cloned()
            .map(|record| self.assemble(record)))
    }

    async fn size(&self) -> Result<usize, ServerError> {
        let store = self.store.read().expect("fake store read lock poisoned");
        Ok(self.matching_records(&store).len())
    }
}

#[async_trait]
impl WorkspaceLogicalRelationships for FakeWorkspaceLogicalRelationships {
    async fn add(
        &self,
        desc: LogicalRelationshipDescription,
    ) -> Result<LogicalRelationship, ServerError> {
        let id = Uuid::new_v4().to_string();
        let mut store = self.store.write().expect("fake store write lock poisoned");
        self.validate_description(&store, &desc)?;
        let mut description = desc;
        description.workspace = Ref::new(self.workspace_id.clone());
        let record = LogicalRelationshipRecord {
            id: id.clone(),
            workspace_id: self.workspace_id.clone(),
            description,
            deleted_at: None,
        };
        store.logical_relationships.insert(id, record.clone());
        Ok(self.assemble(record))
    }

    async fn update(
        &self,
        relationship_id: &str,
        desc: LogicalRelationshipDescription,
    ) -> Result<LogicalRelationship, ServerError> {
        let mut store = self.store.write().expect("fake store write lock poisoned");
        self.validate_description(&store, &desc)?;
        let record = store
            .logical_relationships
            .get_mut(relationship_id)
            .filter(|relationship| relationship.workspace_id == self.workspace_id)
            .filter(|relationship| relationship.deleted_at.is_none())
            .ok_or_else(|| {
                ServerError::NotFound(format!("logical relationship {relationship_id} not found"))
            })?;
        let mut description = desc;
        description.workspace = Ref::new(record.workspace_id.clone());
        record.description = description;
        Ok(self.assemble(record.clone()))
    }

    async fn delete(&self, relationship_id: &str) -> Result<(), ServerError> {
        let mut store = self.store.write().expect("fake store write lock poisoned");
        let relationship = store
            .logical_relationships
            .get_mut(relationship_id)
            .filter(|relationship| relationship.workspace_id == self.workspace_id)
            .filter(|relationship| relationship.deleted_at.is_none())
            .ok_or_else(|| {
                ServerError::NotFound(format!("logical relationship {relationship_id} not found"))
            })?;
        relationship.deleted_at = Some(now());
        Ok(())
    }

    async fn list(
        &self,
        page: u32,
        page_size: u32,
    ) -> Result<(Vec<LogicalRelationship>, u64), ServerError> {
        if page == 0 || page_size == 0 {
            return Err(ServerError::Validation(
                "page and pageSize must be greater than 0".to_string(),
            ));
        }
        let store = self.store.read().expect("fake store read lock poisoned");
        let rows = self.matching_records(&store);
        let total = rows.len() as u64;
        let offset = ((page - 1) * page_size) as usize;
        Ok((
            rows.into_iter()
                .skip(offset)
                .take(page_size as usize)
                .map(|record| self.assemble(record))
                .collect(),
            total,
        ))
    }
}

struct FakeDiagramNodes;

#[async_trait]
impl HasMany<DiagramNode> for FakeDiagramNodes {
    async fn find_all(&self, _from: usize, _to: usize) -> Result<Vec<DiagramNode>, ServerError> {
        Ok(Vec::new())
    }

    async fn find_by_identity(&self, _id: &str) -> Result<Option<DiagramNode>, ServerError> {
        Ok(None)
    }

    async fn size(&self) -> Result<usize, ServerError> {
        Ok(0)
    }
}

impl DiagramNodes for FakeDiagramNodes {}

struct FakeDiagramEdges;

#[async_trait]
impl HasMany<DiagramEdge> for FakeDiagramEdges {
    async fn find_all(&self, _from: usize, _to: usize) -> Result<Vec<DiagramEdge>, ServerError> {
        Ok(Vec::new())
    }

    async fn find_by_identity(&self, _id: &str) -> Result<Option<DiagramEdge>, ServerError> {
        Ok(None)
    }

    async fn size(&self) -> Result<usize, ServerError> {
        Ok(0)
    }
}

impl DiagramEdges for FakeDiagramEdges {}

struct FakeWorkspaceMembers {
    store: SharedFakeStore,
    workspace_id: String,
}

impl FakeWorkspaceMembers {
    fn new(store: SharedFakeStore, workspace_id: String) -> Self {
        Self {
            store,
            workspace_id,
        }
    }

    fn record_to_member(record: MemberRecord) -> Member {
        Member::new(
            record.id,
            MemberDescription {
                workspace: Ref::new(record.workspace_id),
                user: Ref::new(record.user_id),
                role: record.role,
                created_at: record.created_at,
                updated_at: record.updated_at,
            },
        )
    }
}

#[async_trait]
impl HasMany<Member> for FakeWorkspaceMembers {
    async fn find_all(&self, from: usize, to: usize) -> Result<Vec<Member>, ServerError> {
        let store = self.store.read().expect("fake store read lock poisoned");
        let mut rows = store
            .members
            .values()
            .filter(|member| member.workspace_id == self.workspace_id)
            .cloned()
            .collect::<Vec<_>>();
        rows.sort_by(|left, right| left.created_at.cmp(&right.created_at));
        Ok(rows
            .into_iter()
            .skip(from)
            .take(to.saturating_sub(from))
            .map(Self::record_to_member)
            .collect())
    }

    async fn find_by_identity(&self, id: &str) -> Result<Option<Member>, ServerError> {
        let store = self.store.read().expect("fake store read lock poisoned");
        Ok(store
            .members
            .get(id)
            .filter(|member| member.workspace_id == self.workspace_id)
            .cloned()
            .map(Self::record_to_member))
    }

    async fn size(&self) -> Result<usize, ServerError> {
        let store = self.store.read().expect("fake store read lock poisoned");
        Ok(store
            .members
            .values()
            .filter(|member| member.workspace_id == self.workspace_id)
            .count())
    }
}

#[async_trait]
impl WorkspaceMembers for FakeWorkspaceMembers {
    async fn add_member(&self, desc: MemberDescription) -> Result<Member, ServerError> {
        let workspace_id = desc.workspace.id().clone();
        if workspace_id != self.workspace_id {
            return Err(ServerError::Validation(format!(
                "member workspace {workspace_id} does not match scoped workspace {}",
                self.workspace_id
            )));
        }

        let user_id = desc.user.id().clone();
        let mut store = self.store.write().expect("fake store write lock poisoned");

        if !store.users.contains_key(&user_id) {
            return Err(ServerError::NotFound(format!("user {user_id} not found")));
        }
        if store
            .workspaces
            .get(&self.workspace_id)
            .is_none_or(|workspace| workspace.deleted_at.is_some())
        {
            return Err(ServerError::NotFound(format!(
                "workspace {} not found",
                self.workspace_id
            )));
        }
        if store
            .members
            .values()
            .any(|member| member.workspace_id == self.workspace_id && member.user_id == user_id)
        {
            return Err(ServerError::Conflict(format!(
                "user {user_id} is already a workspace member"
            )));
        }

        let timestamp = now();
        let member_id = Uuid::new_v4().to_string();
        let record = MemberRecord {
            id: member_id.clone(),
            workspace_id: self.workspace_id.clone(),
            user_id,
            role: default_if_blank(desc.role, "member"),
            created_at: timestamp.clone(),
            updated_at: timestamp,
        };
        store.members.insert(member_id, record.clone());
        Ok(Self::record_to_member(record))
    }

    async fn remove_member(&self, user_id: &str) -> Result<(), ServerError> {
        let mut store = self.store.write().expect("fake store write lock poisoned");
        let member_id = store
            .members
            .iter()
            .find(|(_, member)| {
                member.workspace_id == self.workspace_id && member.user_id == user_id
            })
            .map(|(id, _)| id.clone())
            .ok_or_else(|| {
                ServerError::NotFound(format!("workspace member {user_id} not found"))
            })?;
        store.members.remove(&member_id);
        Ok(())
    }
}

fn seed_defaults(store: &SharedFakeStore) {
    let timestamp = now();
    let user_id = "desktop-user".to_string();
    let workspace_id = "default-workspace".to_string();
    let member_id = "default-workspace-owner".to_string();

    let mut store = store.write().expect("fake store write lock poisoned");
    store.users.entry(user_id.clone()).or_insert(UserRecord {
        id: user_id.clone(),
        name: "Desktop User".to_string(),
        email: Some("desktop@evidence.local".to_string()),
    });
    store
        .workspaces
        .entry(workspace_id.clone())
        .or_insert(WorkspaceRecord {
            id: workspace_id.clone(),
            title: "Default Workspace".to_string(),
            description: Some("Seed workspace for local desktop usage".to_string()),
            status: "active".to_string(),
            metadata: HashMap::new(),
            created_at: timestamp.clone(),
            updated_at: timestamp.clone(),
            deleted_at: None,
        });
    store
        .members
        .entry(member_id.clone())
        .or_insert(MemberRecord {
            id: member_id,
            workspace_id,
            user_id,
            role: "owner".to_string(),
            created_at: timestamp.clone(),
            updated_at: timestamp,
        });
}

fn normalize_title(title: String) -> Result<String, ServerError> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err(ServerError::Validation(
            "workspace title must not be empty".to_string(),
        ));
    }
    Ok(title)
}

#[cfg(test)]
pub(crate) mod contracts {
    use std::collections::HashMap;

    use crate::domain::{
        LogicalEntityDescription, LogicalEntityType, LogicalRelationshipDescription,
        MemberDescription, Ref, ServerError, Users, WorkspaceDescription,
    };

    pub(crate) async fn user_sees_seed_workspace(users: &dyn Users) {
        let user = users
            .find_by_identity("desktop-user")
            .await
            .unwrap()
            .expect("seed user");

        let (workspaces, total) = user.workspaces().list(1, 10, None).await.unwrap();

        assert!(total >= 1);
        assert!(workspaces
            .iter()
            .any(|workspace| workspace.identity() == "default-workspace"));
    }

    pub(crate) async fn creating_workspace_adds_owner_member(users: &dyn Users) {
        let user = users
            .find_by_identity("desktop-user")
            .await
            .unwrap()
            .expect("seed user");

        let workspace = user
            .workspaces()
            .create(WorkspaceDescription {
                title: "Research".to_string(),
                description: None,
                status: "active".to_string(),
                metadata: HashMap::new(),
                created_at: String::new(),
                updated_at: String::new(),
            })
            .await
            .unwrap();

        let members = workspace.members().find_all(0, 10).await.unwrap();
        assert_eq!(members.len(), 1);
        assert_eq!(members[0].description().role, "owner");
        assert_eq!(members[0].description().user.id(), "desktop-user");
    }

    pub(crate) async fn duplicate_member_is_conflict(users: &dyn Users) {
        let user = users
            .find_by_identity("desktop-user")
            .await
            .unwrap()
            .expect("seed user");
        let workspace = user
            .workspaces()
            .find_by_identity("default-workspace")
            .await
            .unwrap()
            .expect("seed workspace");

        let result = workspace
            .members_wide()
            .add_member(MemberDescription {
                workspace: Ref::new("default-workspace".to_string()),
                user: Ref::new("desktop-user".to_string()),
                role: "member".to_string(),
                created_at: String::new(),
                updated_at: String::new(),
            })
            .await;

        assert!(matches!(result, Err(ServerError::Conflict(_))));
    }

    pub(crate) async fn workspace_has_one_diagram(users: &dyn Users) {
        let workspace = users
            .workspaces()
            .find_by_identity("default-workspace")
            .await
            .unwrap()
            .expect("seed workspace");

        let diagram = workspace.diagram().get().await.unwrap();

        assert!(!diagram.identity().is_empty());
        assert_eq!(diagram.workspace_id(), "default-workspace");
    }

    pub(crate) async fn workspace_logical_relationships_crud(users: &dyn Users) {
        let workspace = users
            .workspaces()
            .find_by_identity("default-workspace")
            .await
            .unwrap()
            .expect("seed workspace");

        let source = workspace
            .logical_entities_wide()
            .add(LogicalEntityDescription {
                workspace: Ref::new("default-workspace".to_string()),
                entity_type: LogicalEntityType::Evidence,
                sub_type: Some("contract".to_string()),
                name: "SalesContract".to_string(),
                label: Some("销售合同".to_string()),
                description: None,
                attributes: vec![],
                created_at: String::new(),
                updated_at: String::new(),
            })
            .await
            .unwrap();
        let target = workspace
            .logical_entities_wide()
            .add(LogicalEntityDescription {
                workspace: Ref::new("default-workspace".to_string()),
                entity_type: LogicalEntityType::Evidence,
                sub_type: Some("fulfillment_request".to_string()),
                name: "DeliveryRequest".to_string(),
                label: Some("交付请求".to_string()),
                description: None,
                attributes: vec![],
                created_at: String::new(),
                updated_at: String::new(),
            })
            .await
            .unwrap();

        let created = workspace
            .logical_relationships_wide()
            .add(LogicalRelationshipDescription {
                workspace: Ref::new("default-workspace".to_string()),
                source: Ref::new(source.identity().to_string()),
                target: Ref::new(target.identity().to_string()),
                label: Some("触发".to_string()),
            })
            .await
            .unwrap();

        assert_eq!(created.description().label.as_deref(), Some("触发"));
        assert_eq!(created.description().source.id(), source.identity());
        assert_eq!(created.description().target.id(), target.identity());

        let found = workspace
            .logical_relationships()
            .find_by_identity(created.identity())
            .await
            .unwrap()
            .expect("created logical relationship");
        assert_eq!(found.identity(), created.identity());

        let (relationships, total) = workspace
            .logical_relationships_wide()
            .list(1, 10)
            .await
            .unwrap();
        assert!(total >= 1);
        assert!(relationships
            .iter()
            .any(|relationship| relationship.identity() == created.identity()));

        let updated = workspace
            .logical_relationships_wide()
            .update(
                created.identity(),
                LogicalRelationshipDescription {
                    workspace: Ref::new("default-workspace".to_string()),
                    source: Ref::new(source.identity().to_string()),
                    target: Ref::new(target.identity().to_string()),
                    label: Some("确认".to_string()),
                },
            )
            .await
            .unwrap();
        assert_eq!(updated.description().label.as_deref(), Some("确认"));

        workspace
            .logical_relationships_wide()
            .delete(created.identity())
            .await
            .unwrap();
        let deleted = workspace
            .logical_relationships()
            .find_by_identity(created.identity())
            .await
            .unwrap();
        assert!(deleted.is_none());
    }

    pub(crate) async fn workspace_logical_entities_crud(users: &dyn Users) {
        let workspace = users
            .workspaces()
            .find_by_identity("default-workspace")
            .await
            .unwrap()
            .expect("seed workspace");

        let created = workspace
            .logical_entities_wide()
            .add(LogicalEntityDescription {
                workspace: Ref::new("default-workspace".to_string()),
                entity_type: LogicalEntityType::Evidence,
                sub_type: Some("EVIDENCE:rfp".to_string()),
                name: "Order".to_string(),
                label: Some("订单".to_string()),
                description: Some("订单业务定义".to_string()),
                attributes: vec![],
                created_at: String::new(),
                updated_at: String::new(),
            })
            .await
            .unwrap();

        assert_eq!(created.description().sub_type.as_deref(), Some("rfp"));
        assert_eq!(created.description().name, "Order");

        let found = workspace
            .logical_entities()
            .find_by_identity(created.identity())
            .await
            .unwrap()
            .expect("created logical entity");
        assert_eq!(found.identity(), created.identity());

        let (entities, total) = workspace.logical_entities_wide().list(1, 10).await.unwrap();
        assert!(total >= 1);
        assert!(entities
            .iter()
            .any(|entity| entity.identity() == created.identity()));

        let updated = workspace
            .logical_entities_wide()
            .update(
                created.identity(),
                LogicalEntityDescription {
                    workspace: Ref::new("default-workspace".to_string()),
                    entity_type: LogicalEntityType::Evidence,
                    sub_type: Some("proposal".to_string()),
                    name: "OrderProposal".to_string(),
                    label: Some("订单提案".to_string()),
                    description: None,
                    attributes: vec![],
                    created_at: String::new(),
                    updated_at: String::new(),
                },
            )
            .await
            .unwrap();
        assert_eq!(updated.description().sub_type.as_deref(), Some("proposal"));
        assert_eq!(updated.description().name, "OrderProposal");

        workspace
            .logical_entities_wide()
            .delete(created.identity())
            .await
            .unwrap();
        let deleted = workspace
            .logical_entities()
            .find_by_identity(created.identity())
            .await
            .unwrap();
        assert!(deleted.is_none());
    }
}

#[cfg(test)]
mod tests {
    use super::{contracts, FakeUsers};

    #[tokio::test]
    async fn fake_user_sees_seed_workspace() {
        contracts::user_sees_seed_workspace(&FakeUsers::new()).await;
    }

    #[tokio::test]
    async fn fake_creating_workspace_adds_owner_member() {
        contracts::creating_workspace_adds_owner_member(&FakeUsers::new()).await;
    }

    #[tokio::test]
    async fn fake_duplicate_member_is_conflict() {
        contracts::duplicate_member_is_conflict(&FakeUsers::new()).await;
    }

    #[tokio::test]
    async fn fake_workspace_has_one_diagram() {
        contracts::workspace_has_one_diagram(&FakeUsers::new()).await;
    }

    #[tokio::test]
    async fn fake_workspace_logical_entities_crud() {
        contracts::workspace_logical_entities_crud(&FakeUsers::new()).await;
    }

    #[tokio::test]
    async fn fake_workspace_logical_relationships_crud() {
        contracts::workspace_logical_relationships_crud(&FakeUsers::new()).await;
    }
}
