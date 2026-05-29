use async_trait::async_trait;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, EntityTrait, PaginatorTrait, QueryFilter,
    QueryOrder, QuerySelect, Set, TransactionTrait,
};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::domain::{
    DiagramNode, DiagramNodes, DraftNode, HasMany, JsonObject, NodeDescription, Position, Ref,
    ServerError,
};

use super::{
    diagram_edges::delete_edges_for_diagram,
    entities::diagram_nodes,
    store::{db_error, now, DbStore},
};

pub struct DbDiagramNodes {
    store: DbStore,
    diagram_id: String,
}

impl DbDiagramNodes {
    pub fn new(store: DbStore, diagram_id: String) -> Self {
        Self { store, diagram_id }
    }
}

#[async_trait]
impl HasMany<DiagramNode> for DbDiagramNodes {
    async fn find_all(&self, from: usize, to: usize) -> Result<Vec<DiagramNode>, ServerError> {
        let limit = to.saturating_sub(from).min(i64::MAX as usize) as u64;
        let rows = diagram_nodes::Entity::find()
            .filter(diagram_nodes::Column::DiagramId.eq(self.diagram_id.clone()))
            .order_by_asc(diagram_nodes::Column::UpdatedAt)
            .offset(from as u64)
            .limit(limit)
            .all(self.store.db())
            .await
            .map_err(db_error)?;
        Ok(rows.into_iter().map(node_from_model).collect())
    }

    async fn find_by_identity(&self, id: &str) -> Result<Option<DiagramNode>, ServerError> {
        Ok(diagram_nodes::Entity::find_by_id(id)
            .filter(diagram_nodes::Column::DiagramId.eq(self.diagram_id.clone()))
            .one(self.store.db())
            .await
            .map_err(db_error)?
            .map(node_from_model))
    }

    async fn size(&self) -> Result<usize, ServerError> {
        let total = diagram_nodes::Entity::find()
            .filter(diagram_nodes::Column::DiagramId.eq(self.diagram_id.clone()))
            .count(self.store.db())
            .await
            .map_err(db_error)?;
        Ok(total as usize)
    }
}

#[async_trait]
impl DiagramNodes for DbDiagramNodes {
    async fn add(&self, desc: NodeDescription) -> Result<DiagramNode, ServerError> {
        self.add_with_id(None, desc).await
    }

    async fn add_with_id(
        &self,
        node_id: Option<String>,
        desc: NodeDescription,
    ) -> Result<DiagramNode, ServerError> {
        let id = node_id.unwrap_or_else(|| Uuid::new_v4().to_string());
        let timestamp = now();
        insert_node(self.store.db(), &self.diagram_id, &id, &desc, &timestamp).await?;
        self.find_by_identity(&id).await?.ok_or_else(|| {
            ServerError::Internal("created diagram node could not be loaded".to_string())
        })
    }

    async fn add_all(
        &self,
        descriptions: Vec<NodeDescription>,
    ) -> Result<Vec<DiagramNode>, ServerError> {
        let mut nodes = Vec::with_capacity(descriptions.len());
        for desc in descriptions {
            nodes.push(self.add(desc).await?);
        }
        Ok(nodes)
    }

    async fn update(
        &self,
        node_id: &str,
        desc: NodeDescription,
    ) -> Result<DiagramNode, ServerError> {
        let model = diagram_nodes::Entity::find_by_id(node_id)
            .filter(diagram_nodes::Column::DiagramId.eq(self.diagram_id.clone()))
            .one(self.store.db())
            .await
            .map_err(db_error)?
            .ok_or_else(|| ServerError::NotFound(format!("diagram node {node_id} not found")))?;
        let mut active: diagram_nodes::ActiveModel = model.into();
        active.kind = Set(desc.kind);
        active.logical_entity_id = Set(desc.logical_entity.map(|value| value.into_id()));
        active.parent_id = Set(desc.parent.map(|value| value.into_id()));
        active.position = Set(to_json_value(&desc.position));
        active.width = Set(desc.width);
        active.height = Set(desc.height);
        active.data = Set(to_json_value(&desc.data));
        active.updated_at = Set(now());
        let updated = active.update(self.store.db()).await.map_err(db_error)?;
        Ok(node_from_model(updated))
    }

    async fn delete(&self, node_id: &str) -> Result<(), ServerError> {
        diagram_nodes::Entity::delete_many()
            .filter(diagram_nodes::Column::DiagramId.eq(self.diagram_id.clone()))
            .filter(diagram_nodes::Column::Id.eq(node_id.to_string()))
            .exec(self.store.db())
            .await
            .map_err(db_error)?;
        Ok(())
    }

    async fn replace_all(&self, nodes: Vec<DraftNode>) -> Result<(), ServerError> {
        let tx = self.store.db().begin().await.map_err(db_error)?;
        delete_edges_for_diagram(&tx, &self.diagram_id).await?;
        delete_nodes_for_diagram(&tx, &self.diagram_id).await?;
        let timestamp = now();
        for node in nodes {
            insert_node(
                &tx,
                &self.diagram_id,
                &node.id,
                &node.description,
                &timestamp,
            )
            .await?;
        }
        tx.commit().await.map_err(db_error)?;
        Ok(())
    }
}

pub(super) fn node_from_model(model: diagram_nodes::Model) -> DiagramNode {
    DiagramNode::new(
        model.id,
        NodeDescription {
            diagram: Ref::new(model.diagram_id),
            kind: model.kind,
            logical_entity: model.logical_entity_id.map(Ref::new),
            parent: model.parent_id.map(Ref::new),
            position: from_json_value(model.position, Position::default()),
            width: model.width,
            height: model.height,
            data: from_json_value(model.data, JsonObject::default()),
            created_at: model.created_at,
            updated_at: model.updated_at,
        },
    )
}

pub(super) async fn delete_nodes_for_diagram<C>(db: &C, diagram_id: &str) -> Result<(), ServerError>
where
    C: ConnectionTrait,
{
    diagram_nodes::Entity::delete_many()
        .filter(diagram_nodes::Column::DiagramId.eq(diagram_id.to_string()))
        .exec(db)
        .await
        .map_err(db_error)?;
    Ok(())
}

pub(super) async fn insert_node<C>(
    db: &C,
    diagram_id: &str,
    id: &str,
    desc: &NodeDescription,
    timestamp: &str,
) -> Result<(), ServerError>
where
    C: ConnectionTrait,
{
    diagram_nodes::ActiveModel {
        id: Set(id.to_string()),
        diagram_id: Set(diagram_id.to_string()),
        kind: Set(desc.kind.clone()),
        logical_entity_id: Set(desc.logical_entity.as_ref().map(|value| value.id().clone())),
        parent_id: Set(desc.parent.as_ref().map(|value| value.id().clone())),
        position: Set(to_json_value(&desc.position)),
        width: Set(desc.width),
        height: Set(desc.height),
        data: Set(to_json_value(&desc.data)),
        created_at: Set(timestamp.to_string()),
        updated_at: Set(timestamp.to_string()),
    }
    .insert(db)
    .await
    .map_err(db_error)?;
    Ok(())
}

fn to_json_value<T: Serialize>(value: &T) -> sea_orm::JsonValue {
    serde_json::to_value(value).unwrap_or_else(|_| json!({}))
}

fn from_json_value<T: DeserializeOwned>(value: sea_orm::JsonValue, fallback: T) -> T {
    serde_json::from_value(value).unwrap_or(fallback)
}
