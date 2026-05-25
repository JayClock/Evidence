use std::{collections::HashSet, sync::Arc};

use async_trait::async_trait;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder,
    QuerySelect, Set, TransactionTrait,
};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::domain::{
    Diagram, DiagramDescription, DiagramStatus, DiagramType, DraftEdge, DraftNode, HasMany, Ref,
    ServerError, Viewport, WorkspaceDiagrams,
};

use super::{
    diagram_edges::{delete_edges_for_diagram, insert_edge, DbDiagramEdges},
    diagram_nodes::{delete_nodes_for_diagram, insert_node, DbDiagramNodes},
    diagram_versions::DbDiagramVersions,
    entities::workspace_diagrams,
    store::{db_error, now, DbStore},
};

pub struct DbWorkspaceDiagrams {
    store: DbStore,
    workspace_id: String,
}

impl DbWorkspaceDiagrams {
    pub fn new(store: DbStore, workspace_id: String) -> Self {
        Self {
            store,
            workspace_id,
        }
    }

    fn assemble(&self, model: workspace_diagrams::Model) -> Diagram {
        assemble_diagram(self.store.clone(), model)
    }

    async fn find_model(&self, id: &str) -> Result<Option<workspace_diagrams::Model>, ServerError> {
        workspace_diagrams::Entity::find_by_id(id)
            .filter(workspace_diagrams::Column::WorkspaceId.eq(self.workspace_id.clone()))
            .filter(workspace_diagrams::Column::DeletedAt.is_null())
            .one(self.store.db())
            .await
            .map_err(db_error)
    }
}

#[async_trait]
impl HasMany<Diagram> for DbWorkspaceDiagrams {
    async fn find_all(&self, from: usize, to: usize) -> Result<Vec<Diagram>, ServerError> {
        let limit = to.saturating_sub(from).min(i64::MAX as usize) as u64;
        let rows = workspace_diagrams::Entity::find()
            .filter(workspace_diagrams::Column::WorkspaceId.eq(self.workspace_id.clone()))
            .filter(workspace_diagrams::Column::DeletedAt.is_null())
            .order_by_desc(workspace_diagrams::Column::UpdatedAt)
            .offset(from as u64)
            .limit(limit)
            .all(self.store.db())
            .await
            .map_err(db_error)?;

        Ok(rows.into_iter().map(|row| self.assemble(row)).collect())
    }

    async fn find_by_identity(&self, id: &str) -> Result<Option<Diagram>, ServerError> {
        Ok(self.find_model(id).await?.map(|row| self.assemble(row)))
    }

    async fn size(&self) -> Result<usize, ServerError> {
        let total = workspace_diagrams::Entity::find()
            .filter(workspace_diagrams::Column::WorkspaceId.eq(self.workspace_id.clone()))
            .filter(workspace_diagrams::Column::DeletedAt.is_null())
            .count(self.store.db())
            .await
            .map_err(db_error)?;
        Ok(total as usize)
    }
}

#[async_trait]
impl WorkspaceDiagrams for DbWorkspaceDiagrams {
    async fn add(&self, desc: DiagramDescription) -> Result<Diagram, ServerError> {
        let title = normalize_title(desc.title)?;
        let id = Uuid::new_v4().to_string();
        let timestamp = now();
        workspace_diagrams::ActiveModel {
            id: Set(id.clone()),
            workspace_id: Set(self.workspace_id.clone()),
            title: Set(title),
            diagram_type: Set(desc.diagram_type.as_str().to_string()),
            status: Set(desc.status.as_str().to_string()),
            viewport: Set(to_json_value(&desc.viewport)),
            created_at: Set(timestamp.clone()),
            updated_at: Set(timestamp),
            deleted_at: Set(None),
        }
        .insert(self.store.db())
        .await
        .map_err(db_error)?;

        self.find_by_identity(&id)
            .await?
            .ok_or_else(|| ServerError::Internal("created diagram could not be loaded".to_string()))
    }

    async fn update(
        &self,
        diagram_id: &str,
        desc: DiagramDescription,
    ) -> Result<Diagram, ServerError> {
        let model = self
            .find_model(diagram_id)
            .await?
            .ok_or_else(|| ServerError::NotFound(format!("diagram {diagram_id} not found")))?;
        let mut active: workspace_diagrams::ActiveModel = model.into();
        active.title = Set(normalize_title(desc.title)?);
        active.diagram_type = Set(desc.diagram_type.as_str().to_string());
        active.status = Set(desc.status.as_str().to_string());
        active.viewport = Set(to_json_value(&desc.viewport));
        active.updated_at = Set(now());
        let updated = active.update(self.store.db()).await.map_err(db_error)?;
        Ok(self.assemble(updated))
    }

    async fn delete(&self, diagram_id: &str) -> Result<(), ServerError> {
        let model = self
            .find_model(diagram_id)
            .await?
            .ok_or_else(|| ServerError::NotFound(format!("diagram {diagram_id} not found")))?;
        let timestamp = now();
        let mut active: workspace_diagrams::ActiveModel = model.into();
        active.deleted_at = Set(Some(timestamp.clone()));
        active.updated_at = Set(timestamp);
        active.update(self.store.db()).await.map_err(db_error)?;
        Ok(())
    }

    async fn list(&self, page: u32, page_size: u32) -> Result<(Vec<Diagram>, u64), ServerError> {
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

    async fn save_diagram(
        &self,
        diagram_id: &str,
        draft_nodes: Vec<DraftNode>,
        draft_edges: Vec<DraftEdge>,
    ) -> Result<(), ServerError> {
        if diagram_id.trim().is_empty() {
            return Err(ServerError::Validation(
                "diagram id must be provided".to_string(),
            ));
        }
        if self.find_by_identity(diagram_id).await?.is_none() {
            return Err(ServerError::NotFound(format!(
                "diagram {diagram_id} not found"
            )));
        }

        let node_ids: HashSet<String> = draft_nodes.iter().map(|node| node.id.clone()).collect();
        for edge in &draft_edges {
            if !node_ids.contains(edge.description.source_node.id()) {
                return Err(ServerError::Validation(format!(
                    "draft edge source node not found: {}",
                    edge.description.source_node.id()
                )));
            }
            if !node_ids.contains(edge.description.target_node.id()) {
                return Err(ServerError::Validation(format!(
                    "draft edge target node not found: {}",
                    edge.description.target_node.id()
                )));
            }
        }

        let tx = self.store.db().begin().await.map_err(db_error)?;
        delete_edges_for_diagram(&tx, diagram_id).await?;
        delete_nodes_for_diagram(&tx, diagram_id).await?;

        let timestamp = now();
        for node in draft_nodes {
            insert_node(&tx, diagram_id, &node.id, &node.description, &timestamp).await?;
        }
        for edge in draft_edges {
            let id = edge.id.unwrap_or_else(|| Uuid::new_v4().to_string());
            insert_edge(&tx, diagram_id, &id, &edge.description, &timestamp).await?;
        }

        let model = workspace_diagrams::Entity::find_by_id(diagram_id)
            .one(&tx)
            .await
            .map_err(db_error)?
            .ok_or_else(|| ServerError::NotFound(format!("diagram {diagram_id} not found")))?;
        let mut active: workspace_diagrams::ActiveModel = model.into();
        active.status = Set(DiagramStatus::Draft.as_str().to_string());
        active.updated_at = Set(timestamp);
        active.update(&tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(())
    }

    async fn publish_diagram(&self, diagram_id: &str) -> Result<(), ServerError> {
        let model = self
            .find_model(diagram_id)
            .await?
            .ok_or_else(|| ServerError::NotFound(format!("diagram {diagram_id} not found")))?;
        let mut active: workspace_diagrams::ActiveModel = model.into();
        active.status = Set(DiagramStatus::Published.as_str().to_string());
        active.updated_at = Set(now());
        active.update(self.store.db()).await.map_err(db_error)?;
        Ok(())
    }
}

fn assemble_diagram(store: DbStore, model: workspace_diagrams::Model) -> Diagram {
    let description = DiagramDescription {
        workspace: Ref::new(model.workspace_id),
        title: model.title,
        diagram_type: DiagramType::try_from(model.diagram_type.as_str())
            .unwrap_or(DiagramType::Class),
        status: DiagramStatus::try_from(model.status.as_str()).unwrap_or(DiagramStatus::Draft),
        viewport: from_json_value(model.viewport, Viewport::default()),
        created_at: model.created_at,
        updated_at: model.updated_at,
    };
    let diagram_id = model.id.clone();
    Diagram::new(
        model.id,
        description,
        Arc::new(DbDiagramNodes::new(store.clone(), diagram_id.clone())),
        Arc::new(DbDiagramEdges::new(store.clone(), diagram_id.clone())),
        Arc::new(DbDiagramVersions::new(store, diagram_id)),
    )
}

fn normalize_title(title: String) -> Result<String, ServerError> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err(ServerError::Validation(
            "diagram title must not be empty".to_string(),
        ));
    }
    Ok(title)
}

fn to_json_value<T: Serialize>(value: &T) -> sea_orm::JsonValue {
    serde_json::to_value(value).unwrap_or_else(|_| json!({}))
}

fn from_json_value<T: DeserializeOwned>(value: sea_orm::JsonValue, fallback: T) -> T {
    serde_json::from_value(value).unwrap_or(fallback)
}
