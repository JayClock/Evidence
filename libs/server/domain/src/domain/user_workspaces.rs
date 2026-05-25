use async_trait::async_trait;

use crate::domain::ServerError;

use super::core::HasMany;
use super::workspace::{Workspace, WorkspaceDescription};

#[async_trait]
pub trait UserWorkspaces: HasMany<Workspace> {
    async fn list(
        &self,
        page: u32,
        page_size: u32,
        query: Option<String>,
    ) -> Result<(Vec<Workspace>, u64), ServerError>;

    async fn create(&self, desc: WorkspaceDescription) -> Result<Workspace, ServerError>;

    async fn update(&self, id: &str, desc: WorkspaceDescription) -> Result<Workspace, ServerError>;

    async fn delete(&self, id: &str) -> Result<(), ServerError>;
}
