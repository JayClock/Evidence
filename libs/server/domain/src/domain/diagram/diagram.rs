use std::sync::Arc;

use serde::{Deserialize, Serialize};

use super::{DiagramEdges, DiagramNodes, Viewport};
use crate::domain::{DiagramEdge, DiagramNode, Entity, HasMany, Ref};

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
}

impl Diagram {
    pub fn new(
        identity: String,
        description: DiagramDescription,
        nodes: Arc<dyn DiagramNodes>,
        edges: Arc<dyn DiagramEdges>,
    ) -> Self {
        Self {
            identity,
            description,
            nodes,
            edges,
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
