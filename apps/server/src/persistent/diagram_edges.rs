use async_trait::async_trait;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, EntityTrait, PaginatorTrait, QueryFilter,
    QueryOrder, QuerySelect, Set, TransactionTrait,
};
use uuid::Uuid;

use crate::domain::{
    DiagramEdge, DiagramEdges, DraftEdge, EdgeDescription, HasMany, Ref, ServerError,
};

use super::{
    entities::diagram_edges,
    store::{db_error, now, PgStore},
};

pub struct PgDiagramEdges {
    store: PgStore,
    diagram_id: String,
}

impl PgDiagramEdges {
    pub fn new(store: PgStore, diagram_id: String) -> Self {
        Self { store, diagram_id }
    }
}

#[async_trait]
impl HasMany<DiagramEdge> for PgDiagramEdges {
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
impl DiagramEdges for PgDiagramEdges {
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
        active.source_node_id = Set(desc.source_node.into_id());
        active.target_node_id = Set(desc.target_node.into_id());
        active.source_handle = Set(desc.source_handle);
        active.target_handle = Set(desc.target_handle);
        active.relation_type = Set(desc.relation_type);
        active.label = Set(desc.label);
        active.style_props = Set(desc.style_props);
        active.hidden = Set(desc.hidden);
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

    async fn replace_all(&self, edges: Vec<DraftEdge>) -> Result<(), ServerError> {
        let tx = self.store.db().begin().await.map_err(db_error)?;
        delete_edges_for_diagram(&tx, &self.diagram_id).await?;
        let timestamp = now();
        for edge in edges {
            let id = edge.id.unwrap_or_else(|| Uuid::new_v4().to_string());
            insert_edge(&tx, &self.diagram_id, &id, &edge.description, &timestamp).await?;
        }
        tx.commit().await.map_err(db_error)?;
        Ok(())
    }
}

pub(super) fn edge_from_model(model: diagram_edges::Model) -> DiagramEdge {
    DiagramEdge::new(
        model.id,
        EdgeDescription {
            diagram: Ref::new(model.diagram_id),
            source_node: Ref::new(model.source_node_id),
            target_node: Ref::new(model.target_node_id),
            source_handle: model.source_handle,
            target_handle: model.target_handle,
            relation_type: model.relation_type,
            label: model.label,
            style_props: model.style_props,
            hidden: model.hidden,
            created_at: model.created_at,
            updated_at: model.updated_at,
        },
    )
}

pub(super) async fn delete_edges_for_diagram<C>(db: &C, diagram_id: &str) -> Result<(), ServerError>
where
    C: ConnectionTrait,
{
    diagram_edges::Entity::delete_many()
        .filter(diagram_edges::Column::DiagramId.eq(diagram_id.to_string()))
        .exec(db)
        .await
        .map_err(db_error)?;
    Ok(())
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
        source_node_id: Set(desc.source_node.id().clone()),
        target_node_id: Set(desc.target_node.id().clone()),
        source_handle: Set(desc.source_handle.clone()),
        target_handle: Set(desc.target_handle.clone()),
        relation_type: Set(desc.relation_type.clone()),
        label: Set(desc.label.clone()),
        style_props: Set(desc.style_props.clone()),
        hidden: Set(desc.hidden),
        created_at: Set(timestamp.to_string()),
        updated_at: Set(timestamp.to_string()),
    }
    .insert(db)
    .await
    .map_err(db_error)?;
    Ok(())
}
