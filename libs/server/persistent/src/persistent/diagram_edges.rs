use async_trait::async_trait;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, EntityTrait, PaginatorTrait, QueryFilter,
    QueryOrder, QuerySelect, Set,
};
use serde::Serialize;
use serde_json::Value;
use uuid::Uuid;

use crate::domain::{
    DiagramEdge, DiagramEdges, EdgeDescription, HasMany, JsonObject, Ref, ServerError,
};

use super::{
    entities::diagram_edges,
    store::{db_error, now, DbStore},
};

pub struct DbDiagramEdges {
    store: DbStore,
    diagram_id: String,
}

impl DbDiagramEdges {
    pub fn new(store: DbStore, diagram_id: String) -> Self {
        Self { store, diagram_id }
    }
}

#[async_trait]
impl HasMany<DiagramEdge> for DbDiagramEdges {
    async fn find_all(&self, from: usize, to: usize) -> Result<Vec<DiagramEdge>, ServerError> {
        let limit = to.saturating_sub(from).min(i64::MAX as usize) as u64;
        let rows = diagram_edges::Entity::find()
            .filter(diagram_edges::Column::DiagramId.eq(self.diagram_id.clone()))
            .order_by_asc(diagram_edges::Column::UpdatedAt)
            .offset(from as u64)
            .limit(limit)
            .all(self.store.db())
            .await
            .map_err(db_error)?;
        Ok(rows.into_iter().map(edge_from_model).collect())
    }

    async fn find_by_identity(&self, id: &str) -> Result<Option<DiagramEdge>, ServerError> {
        Ok(diagram_edges::Entity::find_by_id(id)
            .filter(diagram_edges::Column::DiagramId.eq(self.diagram_id.clone()))
            .one(self.store.db())
            .await
            .map_err(db_error)?
            .map(edge_from_model))
    }

    async fn size(&self) -> Result<usize, ServerError> {
        let total = diagram_edges::Entity::find()
            .filter(diagram_edges::Column::DiagramId.eq(self.diagram_id.clone()))
            .count(self.store.db())
            .await
            .map_err(db_error)?;
        Ok(total as usize)
    }
}

#[async_trait]
impl DiagramEdges for DbDiagramEdges {
    async fn add(&self, desc: EdgeDescription) -> Result<DiagramEdge, ServerError> {
        self.add_with_id(None, desc).await
    }

    async fn add_with_id(
        &self,
        edge_id: Option<String>,
        desc: EdgeDescription,
    ) -> Result<DiagramEdge, ServerError> {
        let id = edge_id.unwrap_or_else(|| Uuid::new_v4().to_string());
        let timestamp = now();
        insert_edge(self.store.db(), &self.diagram_id, &id, &desc, &timestamp).await?;
        self.find_by_identity(&id).await?.ok_or_else(|| {
            ServerError::Internal("created diagram edge could not be loaded".to_string())
        })
    }

    async fn add_all(
        &self,
        descriptions: Vec<EdgeDescription>,
    ) -> Result<Vec<DiagramEdge>, ServerError> {
        let mut edges = Vec::with_capacity(descriptions.len());
        for desc in descriptions {
            edges.push(self.add(desc).await?);
        }
        Ok(edges)
    }

    async fn update(
        &self,
        edge_id: &str,
        desc: EdgeDescription,
    ) -> Result<DiagramEdge, ServerError> {
        let model = diagram_edges::Entity::find_by_id(edge_id)
            .filter(diagram_edges::Column::DiagramId.eq(self.diagram_id.clone()))
            .one(self.store.db())
            .await
            .map_err(db_error)?
            .ok_or_else(|| ServerError::NotFound(format!("diagram edge {edge_id} not found")))?;
        let mut active: diagram_edges::ActiveModel = model.into();
        active.source_id = Set(desc.source.into_id());
        active.target_id = Set(desc.target.into_id());
        active.logical_relationship_id = Set(desc.logical_relationship.map(Ref::into_id));
        active.source_handle = Set(desc.source_handle);
        active.target_handle = Set(desc.target_handle);
        active.kind = Set(desc.kind);
        active.relation_type = Set(None);
        active.label = Set(None);
        active.style = Set(to_json_value(&desc.style));
        active.data = Set(to_json_value(&desc.data));
        active.animated = Set(desc.animated);
        active.hidden = Set(desc.hidden);
        active.marker_start = Set(optional_json_object_to_value(&desc.marker_start));
        active.marker_end = Set(optional_json_object_to_value(&desc.marker_end));
        active.path_options = Set(to_json_value(&desc.path_options));
        active.interaction_width = Set(desc.interaction_width);
        active.updated_at = Set(now());
        let updated = active.update(self.store.db()).await.map_err(db_error)?;
        Ok(edge_from_model(updated))
    }

    async fn delete(&self, edge_id: &str) -> Result<(), ServerError> {
        diagram_edges::Entity::delete_many()
            .filter(diagram_edges::Column::DiagramId.eq(self.diagram_id.clone()))
            .filter(diagram_edges::Column::Id.eq(edge_id.to_string()))
            .exec(self.store.db())
            .await
            .map_err(db_error)?;
        Ok(())
    }
}

pub(super) fn edge_from_model(model: diagram_edges::Model) -> DiagramEdge {
    DiagramEdge::new(
        model.id,
        EdgeDescription {
            diagram: Ref::new(model.diagram_id),
            source: Ref::new(model.source_id),
            target: Ref::new(model.target_id),
            logical_relationship: model.logical_relationship_id.map(Ref::new),
            source_handle: model.source_handle,
            target_handle: model.target_handle,
            kind: model.kind,
            style: json_object(model.style),
            data: json_object(model.data),
            animated: model.animated,
            hidden: model.hidden,
            marker_start: optional_json_object(model.marker_start),
            marker_end: optional_json_object(model.marker_end),
            path_options: json_object(model.path_options),
            interaction_width: model.interaction_width,
            created_at: model.created_at,
            updated_at: model.updated_at,
        },
    )
}

pub(super) async fn insert_edge<C>(
    db: &C,
    diagram_id: &str,
    id: &str,
    desc: &EdgeDescription,
    timestamp: &str,
) -> Result<(), ServerError>
where
    C: ConnectionTrait,
{
    diagram_edges::ActiveModel {
        id: Set(id.to_string()),
        diagram_id: Set(diagram_id.to_string()),
        source_id: Set(desc.source.id().clone()),
        target_id: Set(desc.target.id().clone()),
        logical_relationship_id: Set(desc
            .logical_relationship
            .as_ref()
            .map(|relationship| relationship.id().clone())),
        source_handle: Set(desc.source_handle.clone()),
        target_handle: Set(desc.target_handle.clone()),
        kind: Set(desc.kind.clone()),
        relation_type: Set(None),
        label: Set(None),
        style: Set(to_json_value(&desc.style)),
        data: Set(to_json_value(&desc.data)),
        animated: Set(desc.animated),
        hidden: Set(desc.hidden),
        marker_start: Set(optional_json_object_to_value(&desc.marker_start)),
        marker_end: Set(optional_json_object_to_value(&desc.marker_end)),
        path_options: Set(to_json_value(&desc.path_options)),
        interaction_width: Set(desc.interaction_width),
        created_at: Set(timestamp.to_string()),
        updated_at: Set(timestamp.to_string()),
    }
    .insert(db)
    .await
    .map_err(db_error)?;
    Ok(())
}

fn to_json_value<T: Serialize>(value: &T) -> sea_orm::JsonValue {
    serde_json::to_value(value).unwrap_or_else(|_| Value::Object(Default::default()))
}

fn optional_json_object_to_value(value: &Option<JsonObject>) -> sea_orm::JsonValue {
    value.as_ref().map(to_json_value).unwrap_or(Value::Null)
}

fn json_object(value: sea_orm::JsonValue) -> JsonObject {
    serde_json::from_value(value).unwrap_or_default()
}

fn optional_json_object(value: sea_orm::JsonValue) -> Option<JsonObject> {
    if value.is_null() {
        None
    } else {
        serde_json::from_value(value).ok()
    }
}
