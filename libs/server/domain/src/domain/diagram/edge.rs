use serde::{Deserialize, Serialize};

use super::JsonObject;
use crate::domain::{Entity, Ref};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeDescription {
    pub diagram: Ref<String>,
    pub source: Ref<String>,
    pub target: Ref<String>,
    pub logical_relationship: Option<Ref<String>>,
    pub source_handle: Option<String>,
    pub target_handle: Option<String>,
    pub kind: Option<String>,
    pub style: JsonObject,
    pub data: JsonObject,
    pub animated: bool,
    pub hidden: bool,
    pub marker_start: Option<JsonObject>,
    pub marker_end: Option<JsonObject>,
    pub path_options: JsonObject,
    pub interaction_width: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagramEdge {
    identity: String,
    description: EdgeDescription,
}

impl DiagramEdge {
    pub fn new(identity: String, description: EdgeDescription) -> Self {
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

    pub fn description(&self) -> &EdgeDescription {
        &self.description
    }

    pub fn created_at(&self) -> &str {
        &self.description.created_at
    }

    pub fn updated_at(&self) -> &str {
        &self.description.updated_at
    }
}

impl Entity for DiagramEdge {
    type Identity = str;
    type Description = EdgeDescription;

    fn identity(&self) -> &Self::Identity {
        &self.identity
    }

    fn description(&self) -> &Self::Description {
        &self.description
    }
}
