use async_trait::async_trait;

use crate::domain::ServerError;

use super::core::{Entity, HasMany, Ref};

#[derive(Debug, Clone)]
pub struct MemberDescription {
    pub workspace: Ref<String>,
    pub user: Ref<String>,
    pub role: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct Member {
    identity: String,
    description: MemberDescription,
}

impl Member {
    pub fn new(identity: String, description: MemberDescription) -> Self {
        Self {
            identity,
            description,
        }
    }

    pub fn identity(&self) -> &str {
        &self.identity
    }

    pub fn workspace_id(&self) -> &str {
        self.description.workspace.id()
    }

    pub fn description(&self) -> &MemberDescription {
        &self.description
    }

    pub fn created_at(&self) -> &str {
        &self.description.created_at
    }

    pub fn updated_at(&self) -> &str {
        &self.description.updated_at
    }
}

impl Entity for Member {
    type Identity = str;
    type Description = MemberDescription;

    fn identity(&self) -> &Self::Identity {
        &self.identity
    }

    fn description(&self) -> &Self::Description {
        &self.description
    }
}

#[async_trait]
pub trait WorkspaceMembers: HasMany<Member> {
    async fn add_member(&self, desc: MemberDescription) -> Result<Member, ServerError>;
    async fn remove_member(&self, user_id: &str) -> Result<(), ServerError>;
}
