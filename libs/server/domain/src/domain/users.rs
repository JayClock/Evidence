use async_trait::async_trait;

use crate::domain::ServerError;

use super::{user::User, user_workspaces::UserWorkspaces};

#[async_trait]
pub trait Users: Send + Sync {
    fn workspaces(&self) -> &dyn UserWorkspaces;

    async fn find_by_identity(&self, user_id: &str) -> Result<Option<User>, ServerError>;
}
