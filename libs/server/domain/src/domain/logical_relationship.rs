use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::core::{Entity, HasMany, Ref};
use super::ServerError;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogicalRelationshipDescription {
    pub workspace: Ref<String>,
    pub source: Ref<String>,
    pub target: Ref<String>,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogicalRelationship {
    identity: String,
    description: LogicalRelationshipDescription,
}

impl LogicalRelationship {
    pub fn new(identity: String, description: LogicalRelationshipDescription) -> Self {
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

    pub fn description(&self) -> &LogicalRelationshipDescription {
        &self.description
    }
}

impl Entity for LogicalRelationship {
    type Identity = str;
    type Description = LogicalRelationshipDescription;

    fn identity(&self) -> &Self::Identity {
        &self.identity
    }

    fn description(&self) -> &Self::Description {
        &self.description
    }
}

#[async_trait]
pub trait WorkspaceLogicalRelationships: HasMany<LogicalRelationship> {
    async fn add(
        &self,
        desc: LogicalRelationshipDescription,
    ) -> Result<LogicalRelationship, ServerError>;

    async fn update(
        &self,
        relationship_id: &str,
        desc: LogicalRelationshipDescription,
    ) -> Result<LogicalRelationship, ServerError>;

    async fn delete(&self, relationship_id: &str) -> Result<(), ServerError>;

    async fn list(
        &self,
        page: u32,
        page_size: u32,
    ) -> Result<(Vec<LogicalRelationship>, u64), ServerError>;
}
