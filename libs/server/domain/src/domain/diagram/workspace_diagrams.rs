use async_trait::async_trait;

use super::{Diagram, DiagramDescription, DraftEdge, DraftNode};
use crate::domain::{HasMany, ServerError};

#[async_trait]
pub trait WorkspaceDiagrams: HasMany<Diagram> {
    async fn add(&self, desc: DiagramDescription) -> Result<Diagram, ServerError>;

    async fn update(
        &self,
        diagram_id: &str,
        desc: DiagramDescription,
    ) -> Result<Diagram, ServerError>;

    async fn delete(&self, diagram_id: &str) -> Result<(), ServerError>;

    async fn list(&self, page: u32, page_size: u32) -> Result<(Vec<Diagram>, u64), ServerError>;

    async fn save_diagram(
        &self,
        diagram_id: &str,
        draft_nodes: Vec<DraftNode>,
        draft_edges: Vec<DraftEdge>,
    ) -> Result<(), ServerError>;

    async fn publish_diagram(&self, diagram_id: &str) -> Result<(), ServerError>;
}
