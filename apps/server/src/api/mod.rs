mod error;
mod links;
mod loaders;
mod model;
mod pagination;
mod root;
mod user_workspaces;
mod users;
mod workspace_members;

use axum::Router;
use std::sync::Arc;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::domain::Users;

#[derive(Clone)]
pub(super) struct AppState {
    pub users: Arc<dyn Users>,
}

pub fn app(users: Arc<dyn Users>) -> Router {
    Router::new()
        .merge(root::routes())
        .merge(users::routes())
        .merge(user_workspaces::routes())
        .merge(workspace_members::routes())
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(AppState { users })
}
