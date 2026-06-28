use serde::Serialize;
use std::{collections::BTreeMap, collections::HashMap};

use crate::domain::Workspace;

use super::super::links::{
    user_href, workspace_diagram_href, workspace_href, workspace_logical_entities_href,
    workspace_logical_relationships_href, workspace_members_href, Link,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::api) struct WorkspaceModel {
    #[serde(rename = "_links")]
    links: BTreeMap<String, Link>,
    id: String,
    title: String,
    description: Option<String>,
    status: String,
    metadata: HashMap<String, String>,
    created_at: String,
    updated_at: String,
}

pub(in crate::api) fn workspace_model(user_id: &str, workspace: &Workspace) -> WorkspaceModel {
    let workspace_id = workspace.identity();
    let description = workspace.description();
    WorkspaceModel {
        links: BTreeMap::from([
            (
                "self".to_string(),
                Link::new(workspace_href(user_id, workspace_id)),
            ),
            ("user".to_string(), Link::new(user_href(user_id))),
            (
                "members".to_string(),
                Link::new(workspace_members_href(user_id, workspace_id)),
            ),
            (
                "diagram".to_string(),
                Link::new(workspace_diagram_href(workspace_id)),
            ),
            (
                "logical-entities".to_string(),
                Link::new(workspace_logical_entities_href(workspace_id)),
            ),
            (
                "logical-relationships".to_string(),
                Link::new(workspace_logical_relationships_href(workspace_id)),
            ),
            (
                "collection".to_string(),
                Link::new(super::super::links::user_workspaces_href(user_id)),
            ),
        ]),
        id: workspace_id.to_string(),
        title: description.title.clone(),
        description: description.description.clone(),
        status: description.status.clone(),
        metadata: description.metadata.clone(),
        created_at: description.created_at.clone(),
        updated_at: description.updated_at.clone(),
    }
}
