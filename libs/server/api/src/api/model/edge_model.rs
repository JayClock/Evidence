use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;

use crate::domain::{DiagramEdge, Ref};

use super::super::links::{
    workspace_diagram_edge_href, workspace_diagram_edges_href, workspace_diagram_href, Link,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::api) struct EdgeModel {
    #[serde(rename = "_links")]
    links: BTreeMap<String, Link>,
    id: String,
    source_node: Ref<String>,
    target_node: Ref<String>,
    source_handle: Option<String>,
    target_handle: Option<String>,
    relation_type: Option<String>,
    label: Option<String>,
    style_props: Value,
    hidden: bool,
    created_at: String,
    updated_at: String,
}

pub(in crate::api) fn edge_model(workspace_id: &str, edge: &DiagramEdge) -> EdgeModel {
    let diagram_id = edge.diagram_id();
    let edge_id = edge.identity();
    let description = edge.description();

    EdgeModel {
        links: BTreeMap::from([
            (
                "self".to_string(),
                Link::new(workspace_diagram_edge_href(
                    workspace_id,
                    diagram_id,
                    edge_id,
                )),
            ),
            (
                "collection".to_string(),
                Link::new(workspace_diagram_edges_href(workspace_id, diagram_id)),
            ),
            (
                "diagram".to_string(),
                Link::new(workspace_diagram_href(workspace_id, diagram_id)),
            ),
        ]),
        id: edge_id.to_string(),
        source_node: description.source_node.clone(),
        target_node: description.target_node.clone(),
        source_handle: description.source_handle.clone(),
        target_handle: description.target_handle.clone(),
        relation_type: description.relation_type.clone(),
        label: description.label.clone(),
        style_props: description.style_props.clone(),
        hidden: description.hidden,
        created_at: edge.created_at().to_string(),
        updated_at: edge.updated_at().to_string(),
    }
}
