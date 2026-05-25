use crate::domain::{ServerError, User, Workspace};

use super::AppState;

pub(super) async fn find_user(state: &AppState, user_id: &str) -> Result<User, ServerError> {
    state
        .users
        .find_by_identity(user_id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("user {user_id} not found")))
}

pub(super) async fn find_workspace(
    state: &AppState,
    user_id: &str,
    workspace_id: &str,
) -> Result<Workspace, ServerError> {
    let user = find_user(state, user_id).await?;
    user.workspaces()
        .find_by_identity(workspace_id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("workspace {workspace_id} not found")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persistent::MemoryUsers;
    use std::sync::Arc;

    #[tokio::test]
    async fn finds_seed_user_workspace() {
        let state = AppState {
            users: Arc::new(MemoryUsers::new()),
        };
        let user = find_user(&state, "desktop-user").await.unwrap();
        let (workspaces, total) = user.workspaces().list(1, 10, None).await.unwrap();

        assert_eq!(total, 1);
        assert_eq!(workspaces[0].identity(), "default-workspace");
    }
}
