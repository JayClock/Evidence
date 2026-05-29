use serde::Serialize;
use std::collections::BTreeMap;

use crate::domain::LogicalRelationship;

use super::super::links::{
    workspace_logical_relationship_href, workspace_logical_relationships_href, Link,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::api) struct LogicalRelationshipModel {
    #[serde(rename = "_links")]
    links: BTreeMap<String, Link>,
    id: String,
    source: BTreeMap<String, String>,
    target: BTreeMap<String, String>,
    label: Option<String>,
}

pub(in crate::api) fn logical_relationship_model(
    relationship: &LogicalRelationship,
) -> LogicalRelationshipModel {
    let workspace_id = relationship.workspace_id();
    let relationship_id = relationship.identity();
    let description = relationship.description();

    LogicalRelationshipModel {
        links: BTreeMap::from([
            (
                "self".to_string(),
                Link::new(workspace_logical_relationship_href(
                    workspace_id,
                    relationship_id,
                )),
            ),
            (
                "workspace".to_string(),
                Link::new(format!("/api/workspaces/{workspace_id}")),
            ),
            (
                "collection".to_string(),
                Link::new(workspace_logical_relationships_href(workspace_id)),
            ),
        ]),
        id: relationship_id.to_string(),
        source: BTreeMap::from([("id".to_string(), description.source.id().clone())]),
        target: BTreeMap::from([("id".to_string(), description.target.id().clone())]),
        label: description.label.clone(),
    }
}
