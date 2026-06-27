use serde::Serialize;
use std::collections::BTreeMap;

use crate::domain::LogicalEntity;

use super::super::links::{workspace_logical_entities_href, workspace_logical_entity_href, Link};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::api) struct LogicalEntityModel {
    #[serde(rename = "_links")]
    links: BTreeMap<String, Link>,
    id: String,
    name: String,
    label: Option<String>,
    #[serde(rename = "type")]
    entity_type: String,
    sub_type: Option<String>,
    content: String,
}

pub(in crate::api) fn logical_entity_model(entity: &LogicalEntity) -> LogicalEntityModel {
    let workspace_id = entity.workspace_id();
    let entity_id = entity.identity();
    let description = entity.description();

    LogicalEntityModel {
        links: BTreeMap::from([
            (
                "self".to_string(),
                Link::new(workspace_logical_entity_href(workspace_id, entity_id)),
            ),
            (
                "workspace".to_string(),
                Link::new(format!("/api/workspaces/{workspace_id}")),
            ),
            (
                "collection".to_string(),
                Link::new(workspace_logical_entities_href(workspace_id)),
            ),
        ]),
        id: entity_id.to_string(),
        entity_type: description.entity_type.api_value().to_string(),
        sub_type: description.sub_type.clone(),
        name: description.name.clone(),
        label: description.label.clone(),
        content: description.description.clone().unwrap_or_default(),
    }
}
