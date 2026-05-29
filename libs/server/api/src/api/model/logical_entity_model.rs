use serde::Serialize;
use std::collections::BTreeMap;

use crate::domain::{format_sub_type, EntityAttribute, LogicalEntity};

use super::super::links::{workspace_logical_entities_href, workspace_logical_entity_href, Link};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::api) struct LogicalEntityModel {
    #[serde(rename = "_links")]
    links: BTreeMap<String, Link>,
    id: String,
    #[serde(rename = "type")]
    entity_type: String,
    sub_type: Option<String>,
    name: String,
    label: Option<String>,
    description: Option<String>,
    attributes: Vec<EntityAttribute>,
    created_at: String,
    updated_at: String,
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
        sub_type: format_sub_type(&description.entity_type, description.sub_type.as_deref()),
        name: description.name.clone(),
        label: description.label.clone(),
        description: description.description.clone(),
        attributes: description.attributes.clone(),
        created_at: entity.created_at().to_string(),
        updated_at: entity.updated_at().to_string(),
    }
}
