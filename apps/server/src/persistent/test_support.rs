use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
};

use async_trait::async_trait;
use uuid::Uuid;

use crate::domain::{
    HasMany, Member, MemberDescription, Ref, ServerError, User, UserDescription, UserWorkspaces,
    Users, Workspace, WorkspaceDescription, WorkspaceMembers,
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

#[derive(Default)]
struct FakeStore {
    users: HashMap<String, UserRecord>,
    workspaces: HashMap<String, WorkspaceRecord>,
    members: HashMap<String, MemberRecord>,
}

type SharedFakeStore = Arc<RwLock<FakeStore>>;

pub(crate) struct FakeUsers {
    store: SharedFakeStore,
    workspaces: Arc<FakeUserWorkspaces>,
}

impl FakeUsers {
    pub(crate) fn new() -> Self {
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
            Arc::new(FakeWorkspaceMembers::new(self.store.clone(), record.id)),
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

pub(crate) mod contracts {
    use std::collections::HashMap;

    use crate::domain::{MemberDescription, Ref, ServerError, Users, WorkspaceDescription};

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
}
