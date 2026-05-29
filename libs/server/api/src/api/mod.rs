mod diagrams;
mod error;
mod links;
mod loaders;
mod logical_entities;
mod logical_relationships;
mod model;
mod openapi;
mod pagination;
mod root;
mod sidebar;
mod user_workspaces;
mod users;
mod vendor_media;
mod workspace_members;

use axum::{middleware, Router};
use std::sync::Arc;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::domain::{DomainArchitect, Users};

#[derive(Clone)]
pub(super) struct AppState {
    pub users: Arc<dyn Users>,
    pub domain_architect: Arc<dyn DomainArchitect>,
}

pub use openapi::{openapi, openapi_yaml};

pub fn app(users: Arc<dyn Users>, domain_architect: Arc<dyn DomainArchitect>) -> Router {
    Router::new()
        .merge(root::routes())
        .merge(openapi::routes())
        .merge(users::routes())
        .merge(user_workspaces::routes())
        .merge(workspace_members::routes())
        .merge(diagrams::routes())
        .merge(logical_entities::routes())
        .merge(logical_relationships::routes())
        .merge(sidebar::routes())
        .layer(middleware::from_fn(vendor_media::apply_vendor_media_type))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(AppState {
            users,
            domain_architect,
        })
}
