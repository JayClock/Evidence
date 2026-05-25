use std::sync::Arc;

use super::core::Entity;
use super::user_workspaces::UserWorkspaces;

#[derive(Debug, Clone)]
pub struct UserDescription {
    pub name: String,
    pub email: Option<String>,
}

#[derive(Clone)]
pub struct User {
    identity: String,
    description: UserDescription,
    workspaces: Arc<dyn UserWorkspaces>,
}

impl User {
    pub fn new(
        identity: String,
        description: UserDescription,
        workspaces: Arc<dyn UserWorkspaces>,
    ) -> Self {
        Self {
            identity,
            description,
            workspaces,
        }
    }

    pub fn identity(&self) -> &str {
        &self.identity
    }

    pub fn description(&self) -> &UserDescription {
        &self.description
    }

    pub fn workspaces(&self) -> &dyn UserWorkspaces {
        self.workspaces.as_ref()
    }
}

impl Entity for User {
    type Identity = str;
    type Description = UserDescription;

    fn identity(&self) -> &Self::Identity {
        &self.identity
    }

    fn description(&self) -> &Self::Description {
        &self.description
    }
}
