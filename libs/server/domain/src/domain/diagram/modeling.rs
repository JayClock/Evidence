use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::domain::{LogicalEntityType, Position, Ref};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelingProposal {
    pub summary: String,
    pub changes: ModelingProposalChanges,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelingProposalChanges {
    #[serde(default)]
    pub add_nodes: Vec<ModelingDraftNode>,
    #[serde(default)]
    pub update_nodes: Vec<ModelingDraftNode>,
    #[serde(default)]
    pub delete_nodes: Vec<String>,
    #[serde(default)]
    pub add_edges: Vec<ModelingDraftEdge>,
    #[serde(default)]
    pub update_edges: Vec<ModelingDraftEdge>,
    #[serde(default)]
    pub delete_edges: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelingDraftNode {
    pub id: String,
    pub kind: Option<String>,
    pub parent: Option<Ref<String>>,
    #[serde(default)]
    pub position: Position,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub data: ModelingDraftEntity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelingDraftEdge {
    pub id: Option<String>,
    pub source: Ref<String>,
    pub target: Ref<String>,
    pub source_handle: Option<String>,
    pub target_handle: Option<String>,
    pub kind: Option<String>,
    pub relation_type: Option<String>,
    pub label: Option<String>,
    #[serde(default)]
    pub style: Value,
    #[serde(default)]
    pub data: Value,
    #[serde(default)]
    pub animated: bool,
    #[serde(default)]
    pub hidden: bool,
    #[serde(default)]
    pub marker_start: Value,
    #[serde(default)]
    pub marker_end: Value,
    #[serde(default)]
    pub path_options: Value,
    pub interaction_width: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelingDraftEntity {
    pub name: String,
    pub label: Option<String>,
    #[serde(rename = "type")]
    pub entity_type: LogicalEntityType,
    pub sub_type: Option<String>,
    #[serde(default, flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum ModelingEvent {
    TextChunk {
        chunk: String,
    },
    StructuredChunk {
        kind: String,
        format: String,
        chunk: String,
    },
    ReasoningStarted,
    ReasoningChunk {
        chunk: String,
    },
    ReasoningEnded,
    ToolCallStarted {
        tool_call_id: String,
        tool_name: Option<String>,
    },
    ToolCallDelta {
        tool_call_id: String,
        tool_name: Option<String>,
        chunk: String,
    },
    ToolCallReady {
        tool_call_id: String,
        tool_name: String,
        input: Value,
    },
    ToolExecutionStarted {
        tool_call_id: String,
        tool_name: String,
        args: Value,
    },
    ToolExecutionUpdated {
        tool_call_id: String,
        tool_name: String,
        args: Value,
        partial_result: Value,
    },
    ToolExecutionEnded {
        tool_call_id: String,
        tool_name: String,
        result: Value,
        is_error: bool,
    },
    ProposalReady {
        proposal: ModelingProposal,
    },
}
