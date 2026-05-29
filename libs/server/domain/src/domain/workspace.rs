use std::{collections::HashMap, sync::Arc};

use super::core::{Entity, HasMany};
use super::diagram::{Diagram, WorkspaceDiagrams};
use super::logical_entity::{LogicalEntity, WorkspaceLogicalEntities};
use super::logical_relationship::{LogicalRelationship, WorkspaceLogicalRelationships};
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
    diagrams: Arc<dyn WorkspaceDiagrams>,
    logical_entities: Arc<dyn WorkspaceLogicalEntities>,
    logical_relationships: Arc<dyn WorkspaceLogicalRelationships>,
}

impl Workspace {
    pub fn new(
        identity: String,
        description: WorkspaceDescription,
        members: Arc<dyn WorkspaceMembers>,
        diagrams: Arc<dyn WorkspaceDiagrams>,
        logical_entities: Arc<dyn WorkspaceLogicalEntities>,
        logical_relationships: Arc<dyn WorkspaceLogicalRelationships>,
    ) -> Self {
        Self {
            identity,
            description,
            members,
            diagrams,
            logical_entities,
            logical_relationships,
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

    pub fn diagrams(&self) -> &dyn HasMany<Diagram> {
        self.diagrams.as_ref()
    }

    pub fn diagrams_wide(&self) -> &dyn WorkspaceDiagrams {
        self.diagrams.as_ref()
    }

    pub fn logical_entities(&self) -> &dyn HasMany<LogicalEntity> {
        self.logical_entities.as_ref()
    }

    pub fn logical_entities_wide(&self) -> &dyn WorkspaceLogicalEntities {
        self.logical_entities.as_ref()
    }

    pub fn logical_relationships(&self) -> &dyn HasMany<LogicalRelationship> {
        self.logical_relationships.as_ref()
    }

    pub fn logical_relationships_wide(&self) -> &dyn WorkspaceLogicalRelationships {
        self.logical_relationships.as_ref()
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
