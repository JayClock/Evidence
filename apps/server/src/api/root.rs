use axum::{routing::get, Json, Router};
use serde::Serialize;
use std::collections::BTreeMap;

use super::{
    links::{api_href, health_href, user_href, Link},
    AppState,
};

#[derive(Serialize)]
struct RootResource {
    #[serde(rename = "_links")]
    links: BTreeMap<String, Link>,
}

#[derive(Serialize)]
struct HealthResource {
    #[serde(rename = "_links")]
    links: BTreeMap<String, Link>,
    status: &'static str,
    service: &'static str,
}

async fn get_root() -> Json<RootResource> {
    Json(RootResource {
        links: BTreeMap::from([
            ("self".to_string(), Link::new(api_href())),
            ("health".to_string(), Link::new(health_href())),
            (
                "default-user".to_string(),
                Link::new(user_href("desktop-user")),
            ),
        ]),
    })
}

async fn health() -> Json<HealthResource> {
    Json(HealthResource {
        links: BTreeMap::from([("self".to_string(), Link::new(health_href()))]),
        status: "ok",
        service: "evidence-server",
    })
}

pub(super) fn routes() -> Router<AppState> {
    Router::new()
        .route("/api", get(get_root))
        .route("/health", get(health))
}
