use async_trait::async_trait;

use crate::domain::ServerError;

#[async_trait]
pub trait HasOne<E: Send>: Send + Sync {
    async fn get(&self) -> Result<E, ServerError>;
}
