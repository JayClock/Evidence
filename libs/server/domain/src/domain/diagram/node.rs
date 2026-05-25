use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::domain::{Entity, Ref};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeDescription {
    pub diagram: Ref<String>,
    pub node_type: String,
    pub logical_entity: Option<Ref<String>>,
    pub parent: Option<Ref<String>>,
    pub position_x: f64,
    pub position_y: f64,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub style_config: Value,
    pub local_data: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagramNode {
    identity: String,
    description: NodeDescription,
}

impl DiagramNode {
    pub fn new(identity: String, description: NodeDescription) -> Self {
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

    pub fn description(&self) -> &NodeDescription {
        &self.description
    }

    pub fn created_at(&self) -> &str {
        &self.description.created_at
    }

    pub fn updated_at(&self) -> &str {
        &self.description.updated_at
    }
}

impl Entity for DiagramNode {
    type Identity = str;
    type Description = NodeDescription;

    fn identity(&self) -> &Self::Identity {
        &self.identity
    }

    fn description(&self) -> &Self::Description {
        &self.description
    }
}
