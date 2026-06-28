use axum::{
    body::Body,
    http::{header, HeaderValue, Request},
    middleware::Next,
    response::Response,
};

const ROOT: &str = "application/vnd.evidence.root+json";
const HEALTH: &str = "application/vnd.evidence.health+json";
const USER: &str = "application/vnd.evidence.user+json";
const SIDEBAR: &str = "application/vnd.evidence.sidebar+json";
const WORKSPACE: &str = "application/vnd.evidence.workspace+json";
const WORKSPACES: &str = "application/vnd.evidence.workspaces+json";
const MEMBER: &str = "application/vnd.evidence.member+json";
const MEMBERS: &str = "application/vnd.evidence.members+json";
const DIAGRAM: &str = "application/vnd.evidence.diagram+json";
const DIAGRAMS: &str = "application/vnd.evidence.diagrams+json";
const NODE: &str = "application/vnd.evidence.node+json";
const NODES: &str = "application/vnd.evidence.nodes+json";
const EDGE: &str = "application/vnd.evidence.edge+json";
const EDGES: &str = "application/vnd.evidence.edges+json";
const DIAGRAM_VERSION: &str = "application/vnd.evidence.diagram-version+json";
const DIAGRAM_VERSIONS: &str = "application/vnd.evidence.diagram-versions+json";
const LOGICAL_ENTITY: &str = "application/vnd.evidence.logical-entity+json";
const LOGICAL_ENTITIES: &str = "application/vnd.evidence.logical-entities+json";
const LOGICAL_RELATIONSHIP: &str = "application/vnd.evidence.logical-relationship+json";
const LOGICAL_RELATIONSHIPS: &str = "application/vnd.evidence.logical-relationships+json";

pub(super) async fn apply_vendor_media_type(request: Request<Body>, next: Next) -> Response {
    let path = request.uri().path().to_string();
    let mut response = next.run(request).await;

    if response.status().is_success()
        && response.status().as_u16() != 204
        && response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|content_type| content_type.starts_with("application/json"))
    {
        if let Some(content_type) = resource_content_type(&path) {
            response
                .headers_mut()
                .insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
        }
    }

    response
}

fn resource_content_type(path: &str) -> Option<&'static str> {
    let segments = path
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();

    match segments.as_slice() {
        ["api"] => Some(ROOT),
        ["health"] => Some(HEALTH),
        ["api", "users", _] => Some(USER),
        ["api", "users", _, "sidebar"] => Some(SIDEBAR),
        ["api", "users", _, "workspaces"] => Some(WORKSPACES),
        ["api", "users", _, "workspaces", _] => Some(WORKSPACE),
        ["api", "users", _, "workspaces", _, "members"] => Some(MEMBERS),
        ["api", "users", _, "workspaces", _, "members", _] => Some(MEMBER),
        ["api", "workspaces", _, "diagrams"] => Some(DIAGRAMS),
        ["api", "workspaces", _, "diagrams", _, "nodes"] => Some(NODES),
        ["api", "workspaces", _, "diagrams", _, "nodes", _] => Some(NODE),
        ["api", "workspaces", _, "diagrams", _, "edges"] => Some(EDGES),
        ["api", "workspaces", _, "diagrams", _, "edges", _] => Some(EDGE),
        ["api", "workspaces", _, "diagrams", _, "versions"] => Some(DIAGRAM_VERSIONS),
        ["api", "workspaces", _, "diagrams", _, "versions", _] => Some(DIAGRAM_VERSION),
        ["api", "workspaces", _, "diagrams", _, "commit-draft"] => Some(DIAGRAM),
        ["api", "workspaces", _, "diagrams", _] => Some(DIAGRAM),
        ["api", "workspaces", _, "logical-entities"] => Some(LOGICAL_ENTITIES),
        ["api", "workspaces", _, "logical-entities", _] => Some(LOGICAL_ENTITY),
        ["api", "workspaces", _, "logical-relationships"] => Some(LOGICAL_RELATIONSHIPS),
        ["api", "workspaces", _, "logical-relationships", _] => Some(LOGICAL_RELATIONSHIP),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_resource_content_types_from_paths() {
        assert_eq!(resource_content_type("/api"), Some(ROOT));
        assert_eq!(resource_content_type("/health"), Some(HEALTH));
        assert_eq!(
            resource_content_type("/api/users/desktop-user/workspaces"),
            Some(WORKSPACES)
        );
        assert_eq!(
            resource_content_type("/api/users/desktop-user/workspaces/default-workspace"),
            Some(WORKSPACE)
        );
        assert_eq!(
            resource_content_type("/api/workspaces/default-workspace/diagrams"),
            Some(DIAGRAMS)
        );
        assert_eq!(
            resource_content_type("/api/workspaces/default-workspace/diagrams/diagram-1/nodes"),
            Some(NODES)
        );
        assert_eq!(
            resource_content_type("/api/workspaces/default-workspace/logical-entities/entity-1"),
            Some(LOGICAL_ENTITY)
        );
        assert_eq!(
            resource_content_type(
                "/api/workspaces/default-workspace/logical-relationships/relationship-1"
            ),
            Some(LOGICAL_RELATIONSHIP)
        );
    }
}
