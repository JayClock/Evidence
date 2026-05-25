use async_trait::async_trait;

use super::{DiagramVersion, DiagramVersionDescription};
use crate::domain::{HasMany, ServerError};

#[async_trait]
pub trait DiagramVersions: HasMany<DiagramVersion> {
    async fn add(&self, desc: DiagramVersionDescription) -> Result<DiagramVersion, ServerError>;
}
