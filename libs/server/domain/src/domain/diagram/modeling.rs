use serde::{Deserialize, Serialize};

use crate::domain::{LogicalEntityType, Ref};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelingProposal {
    pub summary: Option<ModelingProposalSummary>,
    #[serde(default)]
    pub operations: Vec<ModelingProposalOperation>,
}

impl ModelingProposal {
    pub fn safe_operations(&self) -> &[ModelingProposalOperation] {
        self.operations.as_slice()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelingProposalSummary {
    pub message: Option<String>,
    pub add_nodes: Option<i64>,
    pub add_edges: Option<i64>,
    pub update_nodes: Option<i64>,
    pub update_edges: Option<i64>,
    pub delete_nodes: Option<i64>,
    pub delete_edges: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelingProposalOperation {
    #[serde(rename = "type")]
    pub operation_type: ModelingProposalOperationType,
    pub target_id: Option<String>,
    pub node: Option<ModelingDraftNode>,
    pub edge: Option<ModelingDraftEdge>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ModelingProposalOperationType {
    AddNode,
    UpdateNode,
    DeleteNode,
    AddEdge,
    UpdateEdge,
    DeleteEdge,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelingDraftNode {
    pub id: String,
    pub parent: Option<Ref<String>>,
    pub data: ModelingDraftEntity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelingDraftEdge {
    pub source: Ref<String>,
    pub target: Ref<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelingDraftEntity {
    pub name: String,
    pub label: Option<String>,
    #[serde(rename = "type")]
    pub entity_type: LogicalEntityType,
    pub sub_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum ModelingEvent {
    StructuredChunk {
        kind: String,
        format: String,
        chunk: String,
    },
    ProposalReady {
        proposal: ModelingProposal,
    },
}
