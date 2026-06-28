use async_trait::async_trait;

use super::{DiagramNode, NodeDescription};
use crate::domain::{HasMany, ServerError};

#[async_trait]
pub trait DiagramNodes: HasMany<DiagramNode> {
    async fn add(&self, desc: NodeDescription) -> Result<DiagramNode, ServerError>;

    async fn add_with_id(
        &self,
        node_id: Option<String>,
        desc: NodeDescription,
    ) -> Result<DiagramNode, ServerError>;

    async fn add_all(
        &self,
        descriptions: Vec<NodeDescription>,
    ) -> Result<Vec<DiagramNode>, ServerError>;

    async fn update(
        &self,
        node_id: &str,
        desc: NodeDescription,
    ) -> Result<DiagramNode, ServerError>;

    async fn delete(&self, node_id: &str) -> Result<(), ServerError>;
}
