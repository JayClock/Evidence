use std::pin::Pin;

use async_trait::async_trait;
use futures_core::Stream;

use super::{ModelingEvent, ModelingProposal, ServerError};

pub type DomainArchitectEventStream =
    Pin<Box<dyn Stream<Item = Result<ModelingEvent, ServerError>> + Send>>;

#[async_trait]
pub trait DomainArchitect: Send + Sync {
    async fn propose_model(&self, requirement: String) -> Result<ModelingProposal, ServerError>;

    fn propose_model_stream(&self, requirement: String) -> DomainArchitectEventStream;
}
