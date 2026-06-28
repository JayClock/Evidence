#![allow(clippy::module_inception)]

mod diagram;
mod diagram_edges;
mod diagram_nodes;
mod domain_architect;
mod edge;
mod modeling;
mod node;
mod types;
mod workspace_diagrams;

pub use diagram::{Diagram, DiagramDescription};
pub use diagram_edges::DiagramEdges;
pub use diagram_nodes::DiagramNodes;
pub use domain_architect::{DomainArchitect, DomainArchitectEventStream};
pub use edge::{DiagramEdge, EdgeDescription};
pub use modeling::{
    ModelingDraftEntity, ModelingDraftRelationship, ModelingEvent, ModelingProposal,
    ModelingProposalChanges,
};
pub use node::{DiagramNode, JsonObject, NodeDescription};
pub use types::{Position, Viewport};
pub use workspace_diagrams::WorkspaceDiagrams;
