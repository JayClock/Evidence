use std::{
    fs,
    path::{Path, PathBuf},
};

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::json;

use crate::domain::{
    DiagramNode, DiagramNodes, EntityAttribute, HasMany, JsonObject, NodeDescription, Position,
    Ref, ServerError,
};

use super::store::DbStore;

pub struct DbDiagramNodes {
    diagram_id: String,
    entities_dir: PathBuf,
}

impl DbDiagramNodes {
    pub fn new(_store: DbStore, diagram_id: String, evidence_root: PathBuf) -> Self {
        Self {
            diagram_id,
            entities_dir: evidence_root.join("entities"),
        }
    }

    fn load_records(&self) -> Result<Vec<YamlDiagramNode>, ServerError> {
        if !self.entities_dir.exists() {
            return Ok(Vec::new());
        }

        let mut records = Vec::new();
        for entry in fs::read_dir(&self.entities_dir).map_err(|error| {
            fs_error(
                format!("read entity directory {}", self.entities_dir.display()),
                error,
            )
        })? {
            let path = entry
                .map_err(|error| fs_error("read entity directory entry", error))?
                .path();

            if !is_yaml_file(&path) {
                continue;
            }

            records.push(read_yaml_node(&self.diagram_id, &path)?);
        }

        records.sort_by(|left, right| {
            left.sort_name
                .cmp(&right.sort_name)
                .then(left.id.cmp(&right.id))
        });

        for (index, record) in records.iter_mut().enumerate() {
            record.description.position = grid_position(index);
        }

        Ok(records)
    }

    fn find_record(&self, id: &str) -> Result<Option<YamlDiagramNode>, ServerError> {
        Ok(self
            .load_records()?
            .into_iter()
            .find(|record| record.id == id))
    }
}

#[async_trait]
impl HasMany<DiagramNode> for DbDiagramNodes {
    async fn find_all(&self, from: usize, to: usize) -> Result<Vec<DiagramNode>, ServerError> {
        Ok(self
            .load_records()?
            .into_iter()
            .skip(from)
            .take(to.saturating_sub(from))
            .map(YamlDiagramNode::into_node)
            .collect())
    }

    async fn find_by_identity(&self, id: &str) -> Result<Option<DiagramNode>, ServerError> {
        Ok(self.find_record(id)?.map(YamlDiagramNode::into_node))
    }

    async fn size(&self) -> Result<usize, ServerError> {
        Ok(self.load_records()?.len())
    }
}

impl DiagramNodes for DbDiagramNodes {}

#[derive(Debug, Clone)]
struct YamlDiagramNode {
    id: String,
    sort_name: String,
    description: NodeDescription,
}

impl YamlDiagramNode {
    fn into_node(self) -> DiagramNode {
        DiagramNode::new(self.id, self.description)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YamlEntityFile {
    id: String,
    name: String,
    label: Option<String>,
    #[serde(rename = "type")]
    entity_type: String,
    #[serde(alias = "sub_type")]
    sub_type: Option<String>,
    parent: Option<String>,
    description: Option<String>,
    content: Option<String>,
    #[serde(default)]
    attributes: Vec<EntityAttribute>,
}

fn read_yaml_node(diagram_id: &str, path: &Path) -> Result<YamlDiagramNode, ServerError> {
    let text = fs::read_to_string(path)
        .map_err(|error| fs_error(format!("read entity file {}", path.display()), error))?;
    parse_yaml_node(diagram_id, path.to_path_buf(), &text)
}

fn parse_yaml_node(
    diagram_id: &str,
    path: PathBuf,
    text: &str,
) -> Result<YamlDiagramNode, ServerError> {
    let document: YamlEntityFile = serde_norway::from_str(text).map_err(|error| {
        ServerError::Validation(format!("invalid entity yaml {}: {error}", path.display()))
    })?;

    let id = required_string(document.id, "id", &path)?;
    let name = required_string(document.name, "name", &path)?;
    let label = optional_string(document.label);
    let entity_type = required_string(document.entity_type, "type", &path)?;
    let sub_type = optional_string(document.sub_type);
    let parent = optional_string(document.parent);
    let content = document
        .content
        .or(document.description)
        .unwrap_or_default();
    let timestamp = file_timestamp(&path);
    let mut data = JsonObject::new();

    data.insert("id".to_string(), json!(id.clone()));
    data.insert("name".to_string(), json!(name.clone()));
    if let Some(label) = &label {
        data.insert("label".to_string(), json!(label));
    }
    data.insert("type".to_string(), json!(entity_type.clone()));
    if let Some(sub_type) = &sub_type {
        data.insert("subType".to_string(), json!(sub_type));
    }
    if let Some(parent) = &parent {
        data.insert("parent".to_string(), json!(parent));
    }
    if !content.trim().is_empty() {
        data.insert("content".to_string(), json!(content));
    }
    if !document.attributes.is_empty() {
        data.insert("attributes".to_string(), json!(document.attributes));
    }

    Ok(YamlDiagramNode {
        id: id.clone(),
        sort_name: label.unwrap_or_else(|| name.clone()),
        description: NodeDescription {
            diagram: Ref::new(diagram_id.to_string()),
            kind: node_kind(&entity_type).to_string(),
            logical_entity: Some(Ref::new(id)),
            parent: parent.map(Ref::new),
            position: Position::default(),
            width: None,
            height: None,
            data,
            created_at: timestamp.clone(),
            updated_at: timestamp,
        },
    })
}

fn required_string(value: String, key: &str, path: &Path) -> Result<String, ServerError> {
    let value = value.trim().to_string();
    if value.is_empty() {
        Err(ServerError::Validation(format!(
            "entity file {} is missing required field {key}",
            path.display()
        )))
    } else {
        Ok(value)
    }
}

fn optional_string(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn is_yaml_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("yaml") || extension.eq_ignore_ascii_case("yml")
        })
}

fn node_kind(entity_type: &str) -> &'static str {
    if entity_type.eq_ignore_ascii_case("CONTEXT") {
        "group-container"
    } else {
        "fulfillment-node"
    }
}

fn grid_position(index: usize) -> Position {
    const COLUMNS: usize = 4;
    const START_X: f64 = 120.0;
    const START_Y: f64 = 120.0;
    const STEP_X: f64 = 240.0;
    const STEP_Y: f64 = 140.0;

    Position {
        x: START_X + (index % COLUMNS) as f64 * STEP_X,
        y: START_Y + (index / COLUMNS) as f64 * STEP_Y,
    }
}

fn file_timestamp(path: &Path) -> String {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .map(|modified| DateTime::<Utc>::from(modified).to_rfc3339())
        .unwrap_or_default()
}

fn fs_error(context: impl Into<String>, error: std::io::Error) -> ServerError {
    ServerError::Internal(format!("{}: {error}", context.into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_entity_yaml_as_diagram_node() {
        let node = parse_yaml_node(
            "diagram-1",
            PathBuf::from("contract.yaml"),
            "id: contract\nname: Contract\nlabel: Contract Document\ntype: EVIDENCE\nsubType: contract\nparent: commerce_context\ndescription: |\n  # Contract\n",
        )
        .unwrap()
        .into_node();

        assert_eq!(node.identity(), "contract");
        assert_eq!(node.diagram_id(), "diagram-1");
        assert_eq!(node.description().kind, "fulfillment-node");
        assert_eq!(
            node.description().logical_entity.as_ref().map(Ref::id),
            Some(&"contract".to_string())
        );
        assert_eq!(
            node.description().data.get("type"),
            Some(&json!("EVIDENCE"))
        );
        assert_eq!(
            node.description().data.get("subType"),
            Some(&json!("contract"))
        );
        assert_eq!(
            node.description().parent.as_ref().map(Ref::id),
            Some(&"commerce_context".to_string())
        );
        assert_eq!(
            node.description().data.get("parent"),
            Some(&json!("commerce_context"))
        );
        assert_eq!(
            node.description().data.get("content"),
            Some(&json!("# Contract\n"))
        );
    }

    #[test]
    fn context_entity_uses_group_node_kind() {
        let node = parse_yaml_node(
            "diagram-1",
            PathBuf::from("context.yaml"),
            "id: bounded_context\nname: BoundedContext\ntype: CONTEXT\nsubType: bounded_context\n",
        )
        .unwrap()
        .into_node();

        assert_eq!(node.description().kind, "group-container");
    }

    #[test]
    fn yaml_extensions_are_model_files() {
        assert!(is_yaml_file(Path::new("entity.yaml")));
        assert!(is_yaml_file(Path::new("entity.yml")));
        assert!(!is_yaml_file(Path::new("entity.md")));
    }
}
