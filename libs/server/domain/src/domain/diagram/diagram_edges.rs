use async_trait::async_trait;

use super::{DiagramEdge, EdgeDescription};
use crate::domain::{HasMany, ServerError};

#[async_trait]
pub trait DiagramEdges: HasMany<DiagramEdge> {
    async fn add(&self, desc: EdgeDescription) -> Result<DiagramEdge, ServerError>;

    async fn add_with_id(
        &self,
        edge_id: Option<String>,
        desc: EdgeDescription,
    ) -> Result<DiagramEdge, ServerError>;

    async fn add_all(
        &self,
        descriptions: Vec<EdgeDescription>,
    ) -> Result<Vec<DiagramEdge>, ServerError>;

    async fn update(
        &self,
        edge_id: &str,
        desc: EdgeDescription,
    ) -> Result<DiagramEdge, ServerError>;

    async fn delete(&self, edge_id: &str) -> Result<(), ServerError>;
}
