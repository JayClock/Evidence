use serde::Serialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;

use crate::domain::{Diagram, Viewport};

use super::super::links::{
    workspace_diagram_edges_href, workspace_diagram_href, workspace_diagram_nodes_href,
    workspace_diagram_propose_model_href, Link,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::api) struct DiagramModel {
    #[serde(rename = "_links")]
    links: BTreeMap<String, Link>,
    #[serde(rename = "_templates")]
    templates: BTreeMap<String, Value>,
    id: String,
    title: String,
    viewport: Viewport,
    created_at: String,
    updated_at: String,
}

pub(in crate::api) fn diagram_model(diagram: &Diagram) -> DiagramModel {
    let workspace_id = diagram.workspace_id();
    let diagram_id = diagram.identity();
    let description = diagram.description();

    DiagramModel {
        links: BTreeMap::from([
            (
                "self".to_string(),
                Link::new(workspace_diagram_href(workspace_id)),
            ),
            (
                "workspace".to_string(),
                Link::new(format!("/api/workspaces/{workspace_id}")),
            ),
            (
                "nodes".to_string(),
                Link::new(workspace_diagram_nodes_href(workspace_id)),
            ),
            (
                "edges".to_string(),
                Link::new(workspace_diagram_edges_href(workspace_id)),
            ),
            (
                "propose-model".to_string(),
                Link::new(workspace_diagram_propose_model_href(workspace_id)),
            ),
        ]),
        templates: BTreeMap::from([(
            "propose-model".to_string(),
            propose_model_template(workspace_id),
        )]),
        id: diagram_id.to_string(),
        title: description.title.clone(),
        viewport: description.viewport.clone(),
        created_at: diagram.created_at().to_string(),
        updated_at: diagram.updated_at().to_string(),
    }
}

fn propose_model_template(workspace_id: &str) -> Value {
    json!({
        "title": "Propose diagram model",
        "method": "POST",
        "target": workspace_diagram_propose_model_href(workspace_id),
        "contentType": "application/json",
        "properties": [
            {
                "name": "requirement",
                "prompt": "Requirement",
                "type": "textarea",
                "required": true,
                "minLength": 1,
            },
        ],
    })
}
