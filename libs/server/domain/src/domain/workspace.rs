use std::{collections::HashMap, sync::Arc};

use super::core::{Entity, HasMany, HasOne};
use super::diagram::{Diagram, WorkspaceDiagram};
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
    diagram: Arc<dyn WorkspaceDiagram>,
    logical_entities: Arc<dyn WorkspaceLogicalEntities>,
    logical_relationships: Arc<dyn WorkspaceLogicalRelationships>,
}

impl Workspace {
    pub fn new(
        identity: String,
        description: WorkspaceDescription,
        members: Arc<dyn WorkspaceMembers>,
        diagram: Arc<dyn WorkspaceDiagram>,
        logical_entities: Arc<dyn WorkspaceLogicalEntities>,
        logical_relationships: Arc<dyn WorkspaceLogicalRelationships>,
    ) -> Self {
        Self {
            identity,
            description,
            members,
            diagram,
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

    pub fn diagram(&self) -> &dyn HasOne<Diagram> {
        self.diagram.as_ref()
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
