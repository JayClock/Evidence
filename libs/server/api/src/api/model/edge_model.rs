use serde::Serialize;
use std::collections::BTreeMap;

use crate::domain::{DiagramEdge, JsonObject, Ref};

use super::super::links::{
    workspace_diagram_edge_href, workspace_diagram_edges_href, workspace_diagram_href, Link,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::api) struct EdgeModel {
    #[serde(rename = "_links")]
    links: BTreeMap<String, Link>,
    id: String,
    source: Ref<String>,
    target: Ref<String>,
    logical_relationship: Option<Ref<String>>,
    source_handle: Option<String>,
    target_handle: Option<String>,
    kind: Option<String>,
    style: JsonObject,
    data: JsonObject,
    animated: bool,
    hidden: bool,
    marker_start: Option<JsonObject>,
    marker_end: Option<JsonObject>,
    path_options: JsonObject,
    interaction_width: Option<f64>,
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
        source: description.source.clone(),
        target: description.target.clone(),
        logical_relationship: description.logical_relationship.clone(),
        source_handle: description.source_handle.clone(),
        target_handle: description.target_handle.clone(),
        kind: description.kind.clone(),
        style: description.style.clone(),
        data: description.data.clone(),
        animated: description.animated,
        hidden: description.hidden,
        marker_start: description.marker_start.clone(),
        marker_end: description.marker_end.clone(),
        path_options: description.path_options.clone(),
        interaction_width: description.interaction_width,
        created_at: edge.created_at().to_string(),
        updated_at: edge.updated_at().to_string(),
    }
}
