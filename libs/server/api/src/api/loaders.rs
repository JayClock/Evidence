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
    use crate::domain::{DomainArchitect, DomainArchitectEventStream, ModelingProposal};
    use crate::persistent::test_support::FakeUsers;
    use async_trait::async_trait;
    use std::sync::Arc;

    struct NoopDomainArchitect;

    #[async_trait]
    impl DomainArchitect for NoopDomainArchitect {
        async fn propose_model(
            &self,
            _requirement: String,
        ) -> Result<ModelingProposal, ServerError> {
            Err(ServerError::Internal("not implemented".to_string()))
        }

        fn propose_model_stream(&self, _requirement: String) -> DomainArchitectEventStream {
            Box::pin(futures_util::stream::empty())
        }
    }

    fn test_state() -> AppState {
        AppState {
            users: Arc::new(FakeUsers::new()),
            domain_architect: Arc::new(NoopDomainArchitect),
        }
    }

    #[tokio::test]
    async fn finds_seed_user_workspace() {
        let state = test_state();
        let user = find_user(&state, "desktop-user").await.unwrap();
        let (workspaces, total) = user.workspaces().list(1, 10, None).await.unwrap();

        assert!(total >= 1);
        assert!(workspaces
            .iter()
            .any(|workspace| workspace.identity() == "default-workspace"));
    }

    #[tokio::test]
    async fn missing_user_is_not_found() {
        let state = test_state();

        let result = find_user(&state, "missing-user").await;

        assert!(matches!(result, Err(ServerError::NotFound(_))));
    }
}
