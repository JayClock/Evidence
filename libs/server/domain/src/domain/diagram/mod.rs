#![allow(clippy::module_inception)]

mod diagram;
mod diagram_edges;
mod diagram_nodes;
mod diagram_versions;
mod edge;
mod node;
mod types;
mod version;
mod workspace_diagrams;

pub use diagram::{Diagram, DiagramDescription};
pub use diagram_edges::DiagramEdges;
pub use diagram_nodes::DiagramNodes;
pub use diagram_versions::DiagramVersions;
pub use edge::{DiagramEdge, EdgeDescription};
pub use node::{DiagramNode, NodeDescription};
pub use types::{DiagramStatus, DiagramType, DraftEdge, DraftNode, Viewport};
pub use version::{
    DiagramSnapshot, DiagramVersion, DiagramVersionDescription, SnapshotEdge, SnapshotNode,
};
pub use workspace_diagrams::WorkspaceDiagrams;
