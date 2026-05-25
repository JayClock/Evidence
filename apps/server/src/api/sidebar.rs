use axum::{
    extract::{Path, State},
    routing::get,
    Json, Router,
};
use serde_json::{json, Value};

use crate::domain::ServerError;

use super::{
    links::{user_href, user_sidebar_href, user_workspaces_href, Link},
    AppState,
};

pub(super) fn routes() -> Router<AppState> {
    Router::new().route("/api/users/{userId}/sidebar", get(get_user_sidebar))
}

async fn get_user_sidebar(
    State(state): State<AppState>,
    Path(user_id): Path<String>,
) -> Result<Json<Value>, ServerError> {
    state
        .users
        .find_by_identity(&user_id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("user {user_id} not found")))?;

    Ok(Json(sidebar_resource(&user_id)))
}

pub(super) fn sidebar_resource(user_id: &str) -> Value {
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
                "items": [
                    {
                        "key": "workspaces",
                        "label": "Workspaces",
                        "type": "resource",
                        "path": user_workspaces_href(user_id),
                        "icon": "layout-dashboard",
                    }
                ]
            }
        ]
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_user_sidebar_resource() {
        let sidebar = sidebar_resource("desktop-user");

        assert_eq!(
            sidebar["_links"]["self"]["href"],
            "/api/users/desktop-user/sidebar"
        );
        assert_eq!(sidebar["sections"][0]["title"], "USER");
        assert_eq!(
            sidebar["sections"][0]["items"][0]["path"],
            "/api/users/desktop-user/workspaces"
        );
    }
}
