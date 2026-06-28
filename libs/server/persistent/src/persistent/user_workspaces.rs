use std::sync::Arc;

use async_trait::async_trait;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, JoinType, PaginatorTrait, QueryFilter, QueryOrder,
    QuerySelect, RelationTrait, Select, Set, TransactionTrait,
};
use uuid::Uuid;

use crate::domain::{HasMany, ServerError, UserWorkspaces, Workspace, WorkspaceDescription};

use super::{
    entities::{workspace_members, workspaces},
    logical_entities::DbWorkspaceLogicalEntities,
    logical_relationships::DbWorkspaceLogicalRelationships,
    store::{
        db_error, default_if_blank, evidence_root_from_metadata, metadata_to_json,
        normalize_workspace_metadata, now, workspace_title_from_metadata, workspace_to_record,
        DbStore, WorkspaceRecord,
    },
    workspace_diagrams::DbWorkspaceDiagrams,
    workspace_members::DbWorkspaceMembers,
};

pub struct DbUserWorkspaces {
    store: DbStore,
    user_id: Option<String>,
}

impl DbUserWorkspaces {
    pub fn new(store: DbStore, user_id: Option<String>) -> Self {
        Self { store, user_id }
    }

    fn visible_query(&self) -> Select<workspaces::Entity> {
        let query = workspaces::Entity::find().filter(workspaces::Column::DeletedAt.is_null());
        match &self.user_id {
            Some(user_id) => query
                .join(
                    JoinType::InnerJoin,
                    workspaces::Relation::WorkspaceMembers.def(),
                )
                .filter(workspace_members::Column::UserId.eq(user_id.clone())),
            None => query,
        }
    }

    async fn find_visible_model(&self, id: &str) -> Result<Option<workspaces::Model>, ServerError> {
        self.visible_query()
            .filter(workspaces::Column::Id.eq(id.to_string()))
            .one(self.store.db())
            .await
            .map_err(db_error)
    }

    fn assemble(&self, record: WorkspaceRecord) -> Workspace {
        let evidence_root = evidence_root_from_metadata(&record.metadata);
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
            Arc::new(DbWorkspaceMembers::new(
                self.store.clone(),
                record.id.clone(),
            )),
            Arc::new(DbWorkspaceDiagrams::new(
                self.store.clone(),
                record.id.clone(),
                evidence_root.clone(),
            )),
            Arc::new(DbWorkspaceLogicalEntities::new(
                self.store.clone(),
                record.id.clone(),
                evidence_root,
            )),
            Arc::new(DbWorkspaceLogicalRelationships::new(
                self.store.clone(),
                record.id,
            )),
        )
    }
}

#[async_trait]
impl HasMany<Workspace> for DbUserWorkspaces {
    async fn find_all(&self, from: usize, to: usize) -> Result<Vec<Workspace>, ServerError> {
        let rows = self
            .visible_query()
            .order_by_desc(workspaces::Column::UpdatedAt)
            .offset(from as u64)
            .limit(to.saturating_sub(from) as u64)
            .all(self.store.db())
            .await
            .map_err(db_error)?;

        Ok(rows
            .into_iter()
            .map(workspace_to_record)
            .map(|record| self.assemble(record))
            .collect())
    }

    async fn find_by_identity(&self, id: &str) -> Result<Option<Workspace>, ServerError> {
        Ok(self
            .find_visible_model(id)
            .await?
            .map(workspace_to_record)
            .map(|record| self.assemble(record)))
    }

    async fn size(&self) -> Result<usize, ServerError> {
        let total = self
            .visible_query()
            .count(self.store.db())
            .await
            .map_err(db_error)?;
        Ok(total as usize)
    }
}

#[async_trait]
impl UserWorkspaces for DbUserWorkspaces {
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

        let mut select = self.visible_query();
        if let Some(query) = query.filter(|value| !value.trim().is_empty()) {
            select = select.filter(
                workspaces::Column::Title
                    .contains(query.trim())
                    .or(workspaces::Column::Description.contains(query.trim())),
            );
        }

        let total = select
            .clone()
            .count(self.store.db())
            .await
            .map_err(db_error)?;
        let rows = select
            .order_by_desc(workspaces::Column::UpdatedAt)
            .offset(((page - 1) * page_size) as u64)
            .limit(page_size as u64)
            .all(self.store.db())
            .await
            .map_err(db_error)?;

        let workspaces = rows
            .into_iter()
            .map(workspace_to_record)
            .map(|record| self.assemble(record))
            .collect();

        Ok((workspaces, total))
    }

    async fn create(&self, desc: WorkspaceDescription) -> Result<Workspace, ServerError> {
        let id = Uuid::new_v4().to_string();
        let timestamp = now();
        let metadata = normalize_workspace_metadata(desc.metadata)?;
        let record = WorkspaceRecord {
            id: id.clone(),
            title: normalize_title(desc.title, &metadata)?,
            description: desc.description,
            status: default_if_blank(desc.status, "active"),
            metadata,
            created_at: timestamp.clone(),
            updated_at: timestamp.clone(),
        };

        let tx = self.store.db().begin().await.map_err(db_error)?;
        workspaces::ActiveModel {
            id: Set(record.id.clone()),
            title: Set(record.title.clone()),
            description: Set(record.description.clone()),
            status: Set(record.status.clone()),
            metadata: Set(metadata_to_json(record.metadata.clone())),
            created_at: Set(record.created_at.clone()),
            updated_at: Set(record.updated_at.clone()),
            deleted_at: Set(None),
        }
        .insert(&tx)
        .await
        .map_err(db_error)?;

        if let Some(user_id) = &self.user_id {
            workspace_members::ActiveModel {
                id: Set(Uuid::new_v4().to_string()),
                workspace_id: Set(id),
                user_id: Set(user_id.clone()),
                role: Set("owner".to_string()),
                created_at: Set(timestamp.clone()),
                updated_at: Set(timestamp),
            }
            .insert(&tx)
            .await
            .map_err(db_error)?;
        }

        tx.commit().await.map_err(db_error)?;
        Ok(self.assemble(record))
    }

    async fn update(&self, id: &str, desc: WorkspaceDescription) -> Result<Workspace, ServerError> {
        let model = self
            .find_visible_model(id)
            .await?
            .ok_or_else(|| ServerError::NotFound(format!("workspace {id} not found")))?;

        let current_metadata = workspace_to_record(model.clone()).metadata;
        let metadata_input = if desc.metadata.is_empty() {
            current_metadata
        } else {
            desc.metadata
        };
        let metadata = normalize_workspace_metadata(metadata_input)?;
        let mut active: workspaces::ActiveModel = model.into();
        active.title = Set(normalize_title(desc.title, &metadata)?);
        active.description = Set(desc.description);
        active.status = Set(default_if_blank(desc.status, "active"));
        active.metadata = Set(metadata_to_json(metadata));
        active.updated_at = Set(now());

        let updated = active.update(self.store.db()).await.map_err(db_error)?;
        Ok(self.assemble(workspace_to_record(updated)))
    }

    async fn delete(&self, id: &str) -> Result<(), ServerError> {
        let model = self
            .find_visible_model(id)
            .await?
            .ok_or_else(|| ServerError::NotFound(format!("workspace {id} not found")))?;

        let timestamp = now();
        let mut active: workspaces::ActiveModel = model.into();
        active.deleted_at = Set(Some(timestamp.clone()));
        active.updated_at = Set(timestamp);
        active.update(self.store.db()).await.map_err(db_error)?;

        Ok(())
    }
}

fn normalize_title(
    title: String,
    metadata: &std::collections::HashMap<String, String>,
) -> Result<String, ServerError> {
    let title = title.trim().to_string();
    if !title.is_empty() {
        return Ok(title);
    }

    workspace_title_from_metadata(metadata)
        .ok_or_else(|| ServerError::Validation("workspace title must not be empty".to_string()))
}
