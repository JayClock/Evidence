use serde::Serialize;
use std::collections::BTreeMap;

use crate::domain::{DiagramNode, JsonObject, Position, Ref};

use super::super::links::{
    workspace_diagram_href, workspace_diagram_node_href, workspace_diagram_nodes_href,
    workspace_logical_entity_href, Link,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::api) struct NodeModel {
    #[serde(rename = "_links")]
    links: BTreeMap<String, Link>,
    id: String,
    kind: String,
    parent: Option<Ref<String>>,
    position: Position,
    width: Option<i64>,
    height: Option<i64>,
    data: JsonObject,
    created_at: String,
    updated_at: String,
}

pub(in crate::api) fn node_model(workspace_id: &str, node: &DiagramNode) -> NodeModel {
    let diagram_id = node.diagram_id();
    let node_id = node.identity();
    let description = node.description();

    let mut links = BTreeMap::from([
        (
            "self".to_string(),
            Link::new(workspace_diagram_node_href(
                workspace_id,
                diagram_id,
                node_id,
            )),
        ),
        (
            "collection".to_string(),
            Link::new(workspace_diagram_nodes_href(workspace_id, diagram_id)),
        ),
        (
            "diagram".to_string(),
            Link::new(workspace_diagram_href(workspace_id, diagram_id)),
        ),
    ]);

    if let Some(logical_entity) = &description.logical_entity {
        links.insert(
            "logicalEntity".to_string(),
            Link::new(workspace_logical_entity_href(
                workspace_id,
                logical_entity.id(),
            )),
        );
    }

    NodeModel {
        links,
        id: node_id.to_string(),
        kind: description.kind.clone(),
        parent: description.parent.clone(),
        position: description.position.clone(),
        width: description.width,
        height: description.height,
        data: description.data.clone(),
        created_at: node.created_at().to_string(),
        updated_at: node.updated_at().to_string(),
    }
}
