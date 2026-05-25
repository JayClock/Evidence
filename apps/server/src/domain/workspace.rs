use std::{collections::HashMap, sync::Arc};

use super::core::{Entity, HasMany};
use super::member::{Member, WorkspaceMembers};

#[derive(Debug, Clone)]
pub struct WorkspaceDescription {
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub metadata: HashMap<String, String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone)]
pub struct Workspace {
    identity: String,
    description: WorkspaceDescription,
    members: Arc<dyn WorkspaceMembers>,
}

impl Workspace {
    pub fn new(
        identity: String,
        description: WorkspaceDescription,
        members: Arc<dyn WorkspaceMembers>,
    ) -> Self {
        Self {
            identity,
            description,
            members,
        }
    }

    pub fn identity(&self) -> &str {
        &self.identity
    }

    pub fn description(&self) -> &WorkspaceDescription {
        &self.description
    }

    pub fn members(&self) -> &dyn HasMany<Member> {
        self.members.as_ref()
    }

    pub fn members_wide(&self) -> &dyn WorkspaceMembers {
        self.members.as_ref()
    }
}

impl Entity for Workspace {
    type Identity = str;
    type Description = WorkspaceDescription;

    fn identity(&self) -> &Self::Identity {
        &self.identity
    }

    fn description(&self) -> &Self::Description {
        &self.description
    }
}
