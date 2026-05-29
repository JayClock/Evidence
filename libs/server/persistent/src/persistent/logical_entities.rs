use async_trait::async_trait;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder,
    QuerySelect, Set,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::{
    normalize_sub_type, EntityAttribute, HasMany, LogicalEntity, LogicalEntityDescription,
    LogicalEntityType, Ref, ServerError, WorkspaceLogicalEntities,
};

use super::{
    entities::logical_entities,
    store::{db_error, now, DbStore},
};

pub struct DbWorkspaceLogicalEntities {
    store: DbStore,
    workspace_id: String,
}

impl DbWorkspaceLogicalEntities {
    pub fn new(store: DbStore, workspace_id: String) -> Self {
        Self {
            store,
            workspace_id,
        }
    }

    fn assemble(&self, model: logical_entities::Model) -> LogicalEntity {
        entity_from_model(model)
    }

    async fn find_model(&self, id: &str) -> Result<Option<logical_entities::Model>, ServerError> {
        logical_entities::Entity::find_by_id(id)
            .filter(logical_entities::Column::WorkspaceId.eq(self.workspace_id.clone()))
            .filter(logical_entities::Column::DeletedAt.is_null())
            .one(self.store.db())
            .await
            .map_err(db_error)
    }
}

#[async_trait]
impl HasMany<LogicalEntity> for DbWorkspaceLogicalEntities {
    async fn find_all(&self, from: usize, to: usize) -> Result<Vec<LogicalEntity>, ServerError> {
        let limit = to.saturating_sub(from).min(i64::MAX as usize) as u64;
        let rows = logical_entities::Entity::find()
            .filter(logical_entities::Column::WorkspaceId.eq(self.workspace_id.clone()))
            .filter(logical_entities::Column::DeletedAt.is_null())
            .order_by_desc(logical_entities::Column::UpdatedAt)
            .offset(from as u64)
            .limit(limit)
            .all(self.store.db())
            .await
            .map_err(db_error)?;

        Ok(rows.into_iter().map(|row| self.assemble(row)).collect())
    }

    async fn find_by_identity(&self, id: &str) -> Result<Option<LogicalEntity>, ServerError> {
        Ok(self.find_model(id).await?.map(|row| self.assemble(row)))
    }

    async fn size(&self) -> Result<usize, ServerError> {
        let total = logical_entities::Entity::find()
            .filter(logical_entities::Column::WorkspaceId.eq(self.workspace_id.clone()))
            .filter(logical_entities::Column::DeletedAt.is_null())
            .count(self.store.db())
            .await
            .map_err(db_error)?;
        Ok(total as usize)
    }
}

#[async_trait]
impl WorkspaceLogicalEntities for DbWorkspaceLogicalEntities {
    async fn add(&self, desc: LogicalEntityDescription) -> Result<LogicalEntity, ServerError> {
        let definition = entity_definition_to_json(&desc);
        let entity_type = desc.entity_type.clone();
        let sub_type = normalize_sub_type(&entity_type, desc.sub_type)?;
        let name = normalize_name(desc.name)?;
        let id = Uuid::new_v4().to_string();
        let timestamp = now();

        logical_entities::ActiveModel {
            id: Set(id.clone()),
            workspace_id: Set(self.workspace_id.clone()),
            entity_type: Set(entity_type.db_value().to_string()),
            sub_type: Set(sub_type),
            name: Set(name),
            label: Set(desc.label),
            definition: Set(definition),
            created_at: Set(timestamp.clone()),
            updated_at: Set(timestamp),
            deleted_at: Set(None),
        }
        .insert(self.store.db())
        .await
        .map_err(db_error)?;

        self.find_by_identity(&id).await?.ok_or_else(|| {
            ServerError::Internal("created logical entity could not be loaded".to_string())
        })
    }

    async fn update(
        &self,
        entity_id: &str,
        desc: LogicalEntityDescription,
    ) -> Result<LogicalEntity, ServerError> {
        let model = self.find_model(entity_id).await?.ok_or_else(|| {
            ServerError::NotFound(format!("logical entity {entity_id} not found"))
        })?;
        let definition = entity_definition_to_json(&desc);
        let entity_type = desc.entity_type.clone();
        let sub_type = normalize_sub_type(&entity_type, desc.sub_type)?;
        let mut active: logical_entities::ActiveModel = model.into();
        active.entity_type = Set(entity_type.db_value().to_string());
        active.sub_type = Set(sub_type);
        active.name = Set(normalize_name(desc.name)?);
        active.label = Set(desc.label);
        active.definition = Set(definition);
        active.updated_at = Set(now());
        let updated = active.update(self.store.db()).await.map_err(db_error)?;
        Ok(self.assemble(updated))
    }

    async fn delete(&self, entity_id: &str) -> Result<(), ServerError> {
        let model = self.find_model(entity_id).await?.ok_or_else(|| {
            ServerError::NotFound(format!("logical entity {entity_id} not found"))
        })?;
        let timestamp = now();
        let mut active: logical_entities::ActiveModel = model.into();
        active.deleted_at = Set(Some(timestamp.clone()));
        active.updated_at = Set(timestamp);
        active.update(self.store.db()).await.map_err(db_error)?;
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
        let total = self.size().await? as u64;
        let from = ((page - 1) * page_size) as usize;
        let to = from + page_size as usize;
        Ok((self.find_all(from, to).await?, total))
    }
}

pub(super) fn entity_from_model(model: logical_entities::Model) -> LogicalEntity {
    let entity_type = LogicalEntityType::try_from(model.entity_type.as_str())
        .unwrap_or(LogicalEntityType::Evidence);
    let definition = entity_definition_from_json(model.definition);
    LogicalEntity::new(
        model.id,
        LogicalEntityDescription {
            workspace: Ref::new(model.workspace_id),
            entity_type,
            sub_type: model.sub_type,
            name: model.name,
            label: model.label,
            description: definition.description,
            attributes: definition.attributes,
            created_at: model.created_at,
            updated_at: model.updated_at,
        },
    )
}

fn normalize_name(name: String) -> Result<String, ServerError> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(ServerError::Validation(
            "logical entity name must not be empty".to_string(),
        ));
    }
    Ok(name)
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct StoredEntityDefinition {
    description: Option<String>,
    #[serde(default)]
    attributes: Vec<EntityAttribute>,
}

fn entity_definition_to_json(desc: &LogicalEntityDescription) -> sea_orm::JsonValue {
    serde_json::to_value(StoredEntityDefinition {
        description: desc.description.clone(),
        attributes: desc.attributes.clone(),
    })
    .unwrap_or(serde_json::Value::Null)
}

fn entity_definition_from_json(value: sea_orm::JsonValue) -> StoredEntityDefinition {
    serde_json::from_value(value).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn maps_model_to_entity() {
        let entity = entity_from_model(logical_entities::Model {
            id: "entity-1".to_string(),
            workspace_id: "workspace-1".to_string(),
            entity_type: "Evidence".to_string(),
            sub_type: Some("rfp".to_string()),
            name: "Order".to_string(),
            label: Some("订单".to_string()),
            definition: json!({
                "description": "订单业务定义",
                "attributes": []
            }),
            created_at: "created".to_string(),
            updated_at: "updated".to_string(),
            deleted_at: None,
        });

        assert_eq!(entity.identity(), "entity-1");
        assert_eq!(entity.workspace_id(), "workspace-1");
        assert_eq!(
            entity.description().entity_type,
            LogicalEntityType::Evidence
        );
        assert_eq!(entity.description().sub_type.as_deref(), Some("rfp"));
        assert_eq!(entity.description().name, "Order");
        assert_eq!(
            entity.description().description.as_deref(),
            Some("订单业务定义")
        );
    }
}
