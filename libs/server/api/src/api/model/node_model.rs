use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;

use crate::domain::{DiagramNode, Ref};

use super::super::links::{
    workspace_diagram_href, workspace_diagram_node_href, workspace_diagram_nodes_href, Link,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::api) struct NodeModel {
    #[serde(rename = "_links")]
    links: BTreeMap<String, Link>,
    id: String,
    #[serde(rename = "type")]
    node_type: String,
    logical_entity: Option<Ref<String>>,
    parent: Option<Ref<String>>,
    position_x: f64,
    position_y: f64,
    width: Option<i64>,
    height: Option<i64>,
    style_config: Value,
    local_data: Value,
    created_at: String,
    updated_at: String,
}

pub(in crate::api) fn node_model(workspace_id: &str, node: &DiagramNode) -> NodeModel {
    let diagram_id = node.diagram_id();
    let node_id = node.identity();
    let description = node.description();

    NodeModel {
        links: BTreeMap::from([
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
        ]),
        id: node_id.to_string(),
        node_type: description.node_type.clone(),
        logical_entity: description.logical_entity.clone(),
        parent: description.parent.clone(),
        position_x: description.position_x,
        position_y: description.position_y,
        width: description.width,
        height: description.height,
        style_config: description.style_config.clone(),
        local_data: description.local_data.clone(),
        created_at: node.created_at().to_string(),
        updated_at: node.updated_at().to_string(),
    }
}
