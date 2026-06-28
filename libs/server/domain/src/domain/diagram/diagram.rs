use std::sync::Arc;

use serde::{Deserialize, Serialize};

use super::{
    DiagramEdges, DiagramNodes, DiagramVersionDescription, DiagramVersions, SnapshotEdge,
    SnapshotNode, Viewport,
};
use crate::domain::{DiagramEdge, DiagramNode, DiagramVersion, Entity, HasMany, Ref, ServerError};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagramDescription {
    pub workspace: Ref<String>,
    pub title: String,
    pub viewport: Viewport,
    pub created_at: String,
    pub updated_at: String,
}

pub struct Diagram {
    identity: String,
    description: DiagramDescription,
    nodes: Arc<dyn DiagramNodes>,
    edges: Arc<dyn DiagramEdges>,
    versions: Arc<dyn DiagramVersions>,
}

impl Diagram {
    pub fn new(
        identity: String,
        description: DiagramDescription,
        nodes: Arc<dyn DiagramNodes>,
        edges: Arc<dyn DiagramEdges>,
        versions: Arc<dyn DiagramVersions>,
    ) -> Self {
        Self {
            identity,
            description,
            nodes,
            edges,
            versions,
        }
    }

    pub fn identity(&self) -> &str {
        &self.identity
    }

    pub fn workspace_id(&self) -> &str {
        self.description.workspace.id()
    }

    pub fn description(&self) -> &DiagramDescription {
        &self.description
    }

    pub fn nodes(&self) -> &dyn HasMany<DiagramNode> {
        self.nodes.as_ref()
    }

    pub fn nodes_wide(&self) -> &dyn DiagramNodes {
        self.nodes.as_ref()
    }

    pub fn edges(&self) -> &dyn HasMany<DiagramEdge> {
        self.edges.as_ref()
    }

    pub fn edges_wide(&self) -> &dyn DiagramEdges {
        self.edges.as_ref()
    }

    pub fn versions(&self) -> &dyn HasMany<DiagramVersion> {
        self.versions.as_ref()
    }

    pub async fn create_version(&self) -> Result<DiagramVersion, ServerError> {
        let nodes = self.nodes.find_all(0, usize::MAX).await?;
        let edges = self.edges.find_all(0, usize::MAX).await?;
        let size = self.versions.size().await?;
        let snapshot = super::DiagramSnapshot {
            nodes: nodes
                .into_iter()
                .map(|node| SnapshotNode {
                    id: node.identity().to_string(),
                    description: node.description().clone(),
                })
                .collect(),
            edges: edges
                .into_iter()
                .map(|edge| SnapshotEdge {
                    id: edge.identity().to_string(),
                    description: edge.description().clone(),
                })
                .collect(),
            viewport: self.description.viewport.clone(),
        };
        self.versions
            .add(DiagramVersionDescription {
                diagram: Ref::new(self.identity.clone()),
                name: format!("v{}", size + 1),
                snapshot,
                created_at: String::new(),
            })
            .await
    }

    pub fn created_at(&self) -> &str {
        &self.description.created_at
    }

    pub fn updated_at(&self) -> &str {
        &self.description.updated_at
    }
}

impl Entity for Diagram {
    type Identity = str;
    type Description = DiagramDescription;

    fn identity(&self) -> &Self::Identity {
        &self.identity
    }

    fn description(&self) -> &Self::Description {
        &self.description
    }
}
