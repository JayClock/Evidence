use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::domain::{EntityAttribute, LogicalEntityType, Ref};

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
    pub add_entities: Vec<ModelingDraftEntity>,
    #[serde(default)]
    pub update_entities: Vec<ModelingDraftEntity>,
    #[serde(default)]
    pub delete_entities: Vec<String>,
    #[serde(default)]
    pub add_relationships: Vec<ModelingDraftRelationship>,
    #[serde(default)]
    pub update_relationships: Vec<ModelingDraftRelationship>,
    #[serde(default)]
    pub delete_relationships: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelingDraftEntity {
    pub id: String,
    pub name: String,
    pub label: Option<String>,
    #[serde(rename = "type")]
    pub entity_type: LogicalEntityType,
    pub sub_type: Option<String>,
    pub description: Option<String>,
    #[serde(default)]
    pub attributes: Vec<EntityAttribute>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelingDraftRelationship {
    pub id: Option<String>,
    pub source: Ref<String>,
    pub target: Ref<String>,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum ModelingEvent {
    TextChunk {
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
    MessageEnded,
    AgentEnded,
    Completed,
}
