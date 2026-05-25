use axum::{
    extract::{Path, State},
    routing::get,
    Json, Router,
};
use serde_json::{json, Value};

use crate::domain::ServerError;

use super::{
    links::{user_href, user_sidebar_href, user_workspaces_href, workspace_diagrams_href, Link},
    AppState,
};

pub(super) fn routes() -> Router<AppState> {
    Router::new().route("/api/users/{userId}/sidebar", get(get_user_sidebar))
}

async fn get_user_sidebar(
    State(state): State<AppState>,
    Path(user_id): Path<String>,
) -> Result<Json<Value>, ServerError> {
    let user = state
        .users
        .find_by_identity(&user_id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("user {user_id} not found")))?;
    let (workspaces, _) = user.workspaces().list(1, 1, None).await?;
    let workspace_id = workspaces.first().map(|workspace| workspace.identity());

    Ok(Json(sidebar_resource(&user_id, workspace_id)))
}

pub(super) fn sidebar_resource(user_id: &str, workspace_id: Option<&str>) -> Value {
    let mut items = vec![json!({
        "key": "workspaces",
        "label": "Workspaces",
        "type": "resource",
        "href": user_workspaces_href(user_id),
        "path": user_workspaces_href(user_id),
        "icon": "layout-dashboard",
    })];

    if let Some(workspace_id) = workspace_id {
        items.push(json!({
            "key": "diagrams",
            "label": "Diagrams",
            "type": "resource",
            "href": workspace_diagrams_href(workspace_id),
            "path": workspace_diagrams_href(workspace_id),
            "icon": "network",
        }));
    }

    json!({
        "_links": {
            "self": Link::new(user_sidebar_href(user_id)),
            "user": Link::new(user_href(user_id)),
        },
        "sections": [
            {
                "title": "USER",
                "key": "user",
                "defaultOpen": true,
                "items": items
            }
        ]
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_user_sidebar_resource() {
        let sidebar = sidebar_resource("desktop-user", Some("default-workspace"));

        assert_eq!(
            sidebar["_links"]["self"]["href"],
            "/api/users/desktop-user/sidebar"
        );
        assert_eq!(sidebar["sections"][0]["title"], "USER");
        assert_eq!(
            sidebar["sections"][0]["items"][0]["path"],
            "/api/users/desktop-user/workspaces"
        );
        assert_eq!(sidebar["sections"][0]["items"][1]["label"], "Diagrams");
        assert_eq!(
            sidebar["sections"][0]["items"][1]["path"],
            "/api/workspaces/default-workspace/diagrams"
        );
    }
}
