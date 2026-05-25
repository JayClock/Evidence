use serde::{Deserialize, Serialize};

use super::{EdgeDescription, NodeDescription, Viewport};
use crate::domain::{Entity, Ref};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagramSnapshot {
    pub nodes: Vec<SnapshotNode>,
    pub edges: Vec<SnapshotEdge>,
    pub viewport: Viewport,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotNode {
    pub id: String,
    pub description: NodeDescription,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotEdge {
    pub id: String,
    pub description: EdgeDescription,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagramVersionDescription {
    pub diagram: Ref<String>,
    pub name: String,
    pub snapshot: DiagramSnapshot,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagramVersion {
    identity: String,
    description: DiagramVersionDescription,
}

impl DiagramVersion {
    pub fn new(identity: String, description: DiagramVersionDescription) -> Self {
        Self {
            identity,
            description,
        }
    }

    pub fn identity(&self) -> &str {
        &self.identity
    }

    pub fn diagram_id(&self) -> &str {
        self.description.diagram.id()
    }

    pub fn description(&self) -> &DiagramVersionDescription {
        &self.description
    }

    pub fn created_at(&self) -> &str {
        &self.description.created_at
    }
}

impl Entity for DiagramVersion {
    type Identity = str;
    type Description = DiagramVersionDescription;

    fn identity(&self) -> &Self::Identity {
        &self.identity
    }

    fn description(&self) -> &Self::Description {
        &self.description
    }
}
