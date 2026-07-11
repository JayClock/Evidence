use std::sync::Arc;

use axum::{
    body::{to_bytes, Body},
    http::{header, Request, StatusCode},
};
use evidence_server_api::{
    app,
    domain::{DomainArchitect, DomainArchitectEventStream},
};
use evidence_server_persistent::test_support::FakeUsers;
use serde_json::{json, Value};
use tower::util::ServiceExt;

struct NoopDomainArchitect;

impl DomainArchitect for NoopDomainArchitect {
    fn propose_model_stream(&self, _requirement: String) -> DomainArchitectEventStream {
        Box::pin(futures_util::stream::empty())
    }
}

#[tokio::test]
async fn get_api_returns_default_entrypoint_links() {
    let response = app(Arc::new(FakeUsers::new()), Arc::new(NoopDomainArchitect))
        .oneshot(
            Request::builder()
                .uri("/api")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("router should respond");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get(header::CONTENT_TYPE),
        Some(&"application/vnd.evidence.root+json".parse().unwrap())
    );

    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body should be readable");
    let payload: Value = serde_json::from_slice(&body).expect("body should be json");

    assert_eq!(
        payload,
        json!({
            "_links": {
                "self": { "href": "/api" },
                "health": { "href": "/health" },
                "default-user": { "href": "/api/users/desktop-user" }
            }
        })
    );
}
