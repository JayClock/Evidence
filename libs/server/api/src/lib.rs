pub use evidence_server_domain as domain;

#[cfg(test)]
pub use evidence_server_persistent as persistent;

pub mod api;

pub use api::{app, openapi, openapi_yaml};
