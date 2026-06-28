use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde_json::json;

use crate::domain::{
    DiagramNode, DiagramNodes, HasMany, JsonObject, NodeDescription, Position, Ref, ServerError,
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

    fn load_records(&self) -> Result<Vec<MarkdownDiagramNode>, ServerError> {
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

            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }

            records.push(read_markdown_node(&self.diagram_id, &path)?);
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

    fn find_record(&self, id: &str) -> Result<Option<MarkdownDiagramNode>, ServerError> {
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
            .map(MarkdownDiagramNode::into_node)
            .collect())
    }

    async fn find_by_identity(&self, id: &str) -> Result<Option<DiagramNode>, ServerError> {
        Ok(self.find_record(id)?.map(MarkdownDiagramNode::into_node))
    }

    async fn size(&self) -> Result<usize, ServerError> {
        Ok(self.load_records()?.len())
    }
}

impl DiagramNodes for DbDiagramNodes {}

#[derive(Debug, Clone)]
struct MarkdownDiagramNode {
    id: String,
    sort_name: String,
    description: NodeDescription,
}

impl MarkdownDiagramNode {
    fn into_node(self) -> DiagramNode {
        DiagramNode::new(self.id, self.description)
    }
}

fn read_markdown_node(diagram_id: &str, path: &Path) -> Result<MarkdownDiagramNode, ServerError> {
    let text = fs::read_to_string(path)
        .map_err(|error| fs_error(format!("read entity file {}", path.display()), error))?;
    parse_markdown_node(diagram_id, path.to_path_buf(), &text)
}

fn parse_markdown_node(
    diagram_id: &str,
    path: PathBuf,
    text: &str,
) -> Result<MarkdownDiagramNode, ServerError> {
    let (meta, content) = split_frontmatter(text).map_err(|message| {
        ServerError::Validation(format!(
            "invalid entity markdown {}: {message}",
            path.display()
        ))
    })?;

    let id = required_meta(&meta, "id", &path)?;
    let name = required_meta(&meta, "name", &path)?;
    let label = optional_meta(&meta, "label");
    let entity_type = required_meta(&meta, "type", &path)?;
    let sub_type = optional_meta(&meta, "subType");
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
    if !content.trim().is_empty() {
        data.insert("content".to_string(), json!(content));
    }

    Ok(MarkdownDiagramNode {
        id: id.clone(),
        sort_name: label.unwrap_or_else(|| name.clone()),
        description: NodeDescription {
            diagram: Ref::new(diagram_id.to_string()),
            kind: node_kind(&entity_type).to_string(),
            logical_entity: Some(Ref::new(id)),
            parent: None,
            position: Position::default(),
            width: None,
            height: None,
            data,
            created_at: timestamp.clone(),
            updated_at: timestamp,
        },
    })
}

fn split_frontmatter(text: &str) -> Result<(HashMap<String, String>, String), &'static str> {
    let text = text.replace("\r\n", "\n");
    let text = text
        .strip_prefix("---\n")
        .ok_or("missing opening frontmatter delimiter")?;
    let (frontmatter, body) = text
        .split_once("\n---")
        .ok_or("missing closing frontmatter delimiter")?;
    let body = body.strip_prefix('\n').unwrap_or(body).to_string();

    let meta = frontmatter
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let (key, value) = line.split_once(':')?;
            Some((key.trim().to_string(), unquote(value.trim()).to_string()))
        })
        .collect();

    Ok((meta, body))
}

fn required_meta(
    meta: &HashMap<String, String>,
    key: &str,
    path: &Path,
) -> Result<String, ServerError> {
    optional_meta(meta, key).ok_or_else(|| {
        ServerError::Validation(format!(
            "entity file {} is missing required metadata {key}",
            path.display()
        ))
    })
}

fn optional_meta(meta: &HashMap<String, String>, key: &str) -> Option<String> {
    meta.get(key)
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
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

fn unquote(value: &str) -> &str {
    value
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
        .or_else(|| {
            value
                .strip_prefix('\'')
                .and_then(|value| value.strip_suffix('\''))
        })
        .unwrap_or(value)
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
    fn parses_entity_markdown_as_diagram_node() {
        let node = parse_markdown_node(
            "diagram-1",
            PathBuf::from("contract.md"),
            "---\nid: contract\nname: Contract\nlabel: Contract Document\ntype: EVIDENCE\nsubType: contract\n---\n# Contract\n",
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
            node.description().data.get("content"),
            Some(&json!("# Contract\n"))
        );
    }

    #[test]
    fn context_entity_uses_group_node_kind() {
        let node = parse_markdown_node(
            "diagram-1",
            PathBuf::from("context.md"),
            "---\nid: bounded_context\nname: BoundedContext\ntype: CONTEXT\nsubType: bounded_context\n---\n",
        )
        .unwrap()
        .into_node();

        assert_eq!(node.description().kind, "group-container");
    }
}
