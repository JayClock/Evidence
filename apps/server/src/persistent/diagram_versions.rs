use async_trait::async_trait;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder,
    QuerySelect, Set,
};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::domain::{
    DiagramSnapshot, DiagramVersion, DiagramVersionDescription, DiagramVersions, HasMany, Ref,
    ServerError, Viewport,
};

use super::{
    entities::diagram_versions,
    store::{db_error, now, DbStore},
};

pub struct DbDiagramVersions {
    store: DbStore,
    diagram_id: String,
}

impl DbDiagramVersions {
    pub fn new(store: DbStore, diagram_id: String) -> Self {
        Self { store, diagram_id }
    }
}

#[async_trait]
impl HasMany<DiagramVersion> for DbDiagramVersions {
    async fn find_all(&self, from: usize, to: usize) -> Result<Vec<DiagramVersion>, ServerError> {
        let limit = to.saturating_sub(from).min(i64::MAX as usize) as u64;
        let rows = diagram_versions::Entity::find()
            .filter(diagram_versions::Column::DiagramId.eq(self.diagram_id.clone()))
            .order_by_desc(diagram_versions::Column::CreatedAt)
            .offset(from as u64)
            .limit(limit)
            .all(self.store.db())
            .await
            .map_err(db_error)?;
        Ok(rows.into_iter().map(version_from_model).collect())
    }

    async fn find_by_identity(&self, id: &str) -> Result<Option<DiagramVersion>, ServerError> {
        Ok(diagram_versions::Entity::find_by_id(id)
            .filter(diagram_versions::Column::DiagramId.eq(self.diagram_id.clone()))
            .one(self.store.db())
            .await
            .map_err(db_error)?
            .map(version_from_model))
    }

    async fn size(&self) -> Result<usize, ServerError> {
        let total = diagram_versions::Entity::find()
            .filter(diagram_versions::Column::DiagramId.eq(self.diagram_id.clone()))
            .count(self.store.db())
            .await
            .map_err(db_error)?;
        Ok(total as usize)
    }
}

#[async_trait]
impl DiagramVersions for DbDiagramVersions {
    async fn add(&self, desc: DiagramVersionDescription) -> Result<DiagramVersion, ServerError> {
        let id = Uuid::new_v4().to_string();
        let timestamp = now();
        diagram_versions::ActiveModel {
            id: Set(id.clone()),
            diagram_id: Set(self.diagram_id.clone()),
            version_name: Set(desc.name),
            snapshot: Set(to_json_value(&desc.snapshot)),
            created_at: Set(timestamp),
        }
        .insert(self.store.db())
        .await
        .map_err(db_error)?;
        self.find_by_identity(&id).await?.ok_or_else(|| {
            ServerError::Internal("created diagram version could not be loaded".to_string())
        })
    }
}

fn version_from_model(model: diagram_versions::Model) -> DiagramVersion {
    DiagramVersion::new(
        model.id,
        DiagramVersionDescription {
            diagram: Ref::new(model.diagram_id),
            name: model.version_name,
            snapshot: from_json_value(
                model.snapshot,
                DiagramSnapshot {
                    nodes: Vec::new(),
                    edges: Vec::new(),
                    viewport: Viewport::default(),
                },
            ),
            created_at: model.created_at,
        },
    )
}

fn to_json_value<T: Serialize>(value: &T) -> sea_orm::JsonValue {
    serde_json::to_value(value).unwrap_or_else(|_| json!({}))
}

fn from_json_value<T: DeserializeOwned>(value: sea_orm::JsonValue, fallback: T) -> T {
    serde_json::from_value(value).unwrap_or(fallback)
}
