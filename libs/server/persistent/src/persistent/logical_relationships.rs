use async_trait::async_trait;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter, QuerySelect, Set,
};
use uuid::Uuid;

use crate::domain::{
    HasMany, LogicalRelationship, LogicalRelationshipDescription, Ref, ServerError,
    WorkspaceLogicalRelationships,
};

use super::{
    entities::{logical_entities, logical_relationships},
    store::{db_error, now, DbStore},
};

pub struct DbWorkspaceLogicalRelationships {
    store: DbStore,
    workspace_id: String,
}

impl DbWorkspaceLogicalRelationships {
    pub fn new(store: DbStore, workspace_id: String) -> Self {
        Self {
            store,
            workspace_id,
        }
    }

    fn assemble(&self, model: logical_relationships::Model) -> LogicalRelationship {
        relationship_from_model(model)
    }

    async fn find_model(
        &self,
        id: &str,
    ) -> Result<Option<logical_relationships::Model>, ServerError> {
        logical_relationships::Entity::find_by_id(id)
            .filter(logical_relationships::Column::WorkspaceId.eq(self.workspace_id.clone()))
            .filter(logical_relationships::Column::DeletedAt.is_null())
            .one(self.store.db())
            .await
            .map_err(db_error)
    }

    async fn ensure_endpoint(&self, entity_id: &str, label: &str) -> Result<(), ServerError> {
        let exists = logical_entities::Entity::find_by_id(entity_id)
            .filter(logical_entities::Column::WorkspaceId.eq(self.workspace_id.clone()))
            .filter(logical_entities::Column::DeletedAt.is_null())
            .one(self.store.db())
            .await
            .map_err(db_error)?
            .is_some();

        if exists {
            Ok(())
        } else {
            Err(ServerError::Validation(format!(
                "logical relationship {label} endpoint {entity_id} not found in workspace {}",
                self.workspace_id
            )))
        }
    }

    async fn validate_description(
        &self,
        desc: &LogicalRelationshipDescription,
    ) -> Result<(), ServerError> {
        self.ensure_endpoint(desc.source.id(), "source").await?;
        self.ensure_endpoint(desc.target.id(), "target").await?;
        Ok(())
    }
}

#[async_trait]
impl HasMany<LogicalRelationship> for DbWorkspaceLogicalRelationships {
    async fn find_all(
        &self,
        from: usize,
        to: usize,
    ) -> Result<Vec<LogicalRelationship>, ServerError> {
        let limit = to.saturating_sub(from).min(i64::MAX as usize) as u64;
        let rows = logical_relationships::Entity::find()
            .filter(logical_relationships::Column::WorkspaceId.eq(self.workspace_id.clone()))
            .filter(logical_relationships::Column::DeletedAt.is_null())
            .offset(from as u64)
            .limit(limit)
            .all(self.store.db())
            .await
            .map_err(db_error)?;

        Ok(rows.into_iter().map(|row| self.assemble(row)).collect())
    }

    async fn find_by_identity(&self, id: &str) -> Result<Option<LogicalRelationship>, ServerError> {
        Ok(self.find_model(id).await?.map(|row| self.assemble(row)))
    }

    async fn size(&self) -> Result<usize, ServerError> {
        let total = logical_relationships::Entity::find()
            .filter(logical_relationships::Column::WorkspaceId.eq(self.workspace_id.clone()))
            .filter(logical_relationships::Column::DeletedAt.is_null())
            .count(self.store.db())
            .await
            .map_err(db_error)?;
        Ok(total as usize)
    }
}

#[async_trait]
impl WorkspaceLogicalRelationships for DbWorkspaceLogicalRelationships {
    async fn add(
        &self,
        desc: LogicalRelationshipDescription,
    ) -> Result<LogicalRelationship, ServerError> {
        self.validate_description(&desc).await?;
        let id = Uuid::new_v4().to_string();

        logical_relationships::ActiveModel {
            id: Set(id.clone()),
            workspace_id: Set(self.workspace_id.clone()),
            source_id: Set(desc.source.into_id()),
            target_id: Set(desc.target.into_id()),
            label: Set(desc.label),
            deleted_at: Set(None),
        }
        .insert(self.store.db())
        .await
        .map_err(db_error)?;

        self.find_by_identity(&id).await?.ok_or_else(|| {
            ServerError::Internal("created logical relationship could not be loaded".to_string())
        })
    }

    async fn update(
        &self,
        relationship_id: &str,
        desc: LogicalRelationshipDescription,
    ) -> Result<LogicalRelationship, ServerError> {
        let model = self.find_model(relationship_id).await?.ok_or_else(|| {
            ServerError::NotFound(format!("logical relationship {relationship_id} not found"))
        })?;
        self.validate_description(&desc).await?;
        let mut active: logical_relationships::ActiveModel = model.into();
        active.source_id = Set(desc.source.into_id());
        active.target_id = Set(desc.target.into_id());
        active.label = Set(desc.label);
        let updated = active.update(self.store.db()).await.map_err(db_error)?;
        Ok(self.assemble(updated))
    }

    async fn delete(&self, relationship_id: &str) -> Result<(), ServerError> {
        let model = self.find_model(relationship_id).await?.ok_or_else(|| {
            ServerError::NotFound(format!("logical relationship {relationship_id} not found"))
        })?;
        let mut active: logical_relationships::ActiveModel = model.into();
        active.deleted_at = Set(Some(now()));
        active.update(self.store.db()).await.map_err(db_error)?;
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
        let total = self.size().await? as u64;
        let from = ((page - 1) * page_size) as usize;
        let to = from + page_size as usize;
        Ok((self.find_all(from, to).await?, total))
    }
}

pub(super) fn relationship_from_model(model: logical_relationships::Model) -> LogicalRelationship {
    LogicalRelationship::new(
        model.id,
        LogicalRelationshipDescription {
            workspace: Ref::new(model.workspace_id),
            source: Ref::new(model.source_id),
            target: Ref::new(model.target_id),
            label: model.label,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_model_to_relationship() {
        let relationship = relationship_from_model(logical_relationships::Model {
            id: "relationship-1".to_string(),
            workspace_id: "workspace-1".to_string(),
            source_id: "entity-1".to_string(),
            target_id: "entity-2".to_string(),
            label: Some("produces".to_string()),
            deleted_at: None,
        });

        assert_eq!(relationship.identity(), "relationship-1");
        assert_eq!(relationship.workspace_id(), "workspace-1");
        assert_eq!(relationship.description().source.id(), "entity-1");
        assert_eq!(relationship.description().target.id(), "entity-2");
        assert_eq!(
            relationship.description().label.as_deref(),
            Some("produces")
        );
    }
}
