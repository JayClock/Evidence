use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub(super) struct Link {
    href: String,
}

impl Link {
    pub(super) fn new(href: impl Into<String>) -> Self {
        Self { href: href.into() }
    }
}

pub(super) fn api_href() -> String {
    "/api".to_string()
}

pub(super) fn health_href() -> String {
    "/health".to_string()
}

pub(super) fn user_href(user_id: &str) -> String {
    format!("/api/users/{user_id}")
}

pub(super) fn user_workspaces_href(user_id: &str) -> String {
    format!("/api/users/{user_id}/workspaces")
}

pub(super) fn user_workspaces_page_href(user_id: &str, page: u32, page_size: u32) -> String {
    format!(
        "{}?page={page}&pageSize={page_size}",
        user_workspaces_href(user_id)
    )
}

pub(super) fn workspace_href(user_id: &str, workspace_id: &str) -> String {
    format!("/api/users/{user_id}/workspaces/{workspace_id}")
}

pub(super) fn workspace_members_href(user_id: &str, workspace_id: &str) -> String {
    format!("{}/members", workspace_href(user_id, workspace_id))
}

pub(super) fn workspace_diagrams_href(workspace_id: &str) -> String {
    format!("/api/workspaces/{workspace_id}/diagrams")
}

pub(super) fn workspace_logical_entities_href(workspace_id: &str) -> String {
    format!("/api/workspaces/{workspace_id}/logical-entities")
}

pub(super) fn workspace_member_href(user_id: &str, workspace_id: &str, member_id: &str) -> String {
    format!(
        "{}/{}",
        workspace_members_href(user_id, workspace_id),
        member_id
    )
}
