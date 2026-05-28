use std::pin::Pin;

use futures_core::Stream;

use super::ModelingEvent;
use crate::domain::ServerError;

pub type DomainArchitectEventStream =
    Pin<Box<dyn Stream<Item = Result<ModelingEvent, ServerError>> + Send>>;

pub trait DomainArchitect: Send + Sync {
    fn propose_model_stream(&self, requirement: String) -> DomainArchitectEventStream;
}
