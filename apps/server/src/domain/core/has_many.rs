use async_trait::async_trait;

use crate::domain::ServerError;

#[async_trait]
pub trait HasMany<E: Send>: Send + Sync {
    async fn find_all(&self, from: usize, to: usize) -> Result<Vec<E>, ServerError>;

    async fn find_by_identity(&self, id: &str) -> Result<Option<E>, ServerError>;

    async fn size(&self) -> Result<usize, ServerError>;
}
