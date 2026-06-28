use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde_json::json;

use crate::domain::{
    DiagramEdge, DiagramEdges, EdgeDescription, HasMany, JsonObject, Ref, ServerError,
};

use super::store::DbStore;

pub struct DbDiagramEdges {
    diagram_id: String,
    associations_dir: PathBuf,
}

impl DbDiagramEdges {
    pub fn new(_store: DbStore, diagram_id: String, evidence_root: PathBuf) -> Self {
        Self {
            diagram_id,
            associations_dir: evidence_root.join("associations"),
        }
    }

    fn load_records(&self) -> Result<Vec<MarkdownDiagramEdge>, ServerError> {
        if !self.associations_dir.exists() {
            return Ok(Vec::new());
        }

        let mut records = Vec::new();
        for entry in fs::read_dir(&self.associations_dir).map_err(|error| {
            fs_error(
                format!(
                    "read association directory {}",
                    self.associations_dir.display()
                ),
                error,
            )
        })? {
            let path = entry
                .map_err(|error| fs_error("read association directory entry", error))?
                .path();

            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }

            records.push(read_markdown_edge(&self.diagram_id, &path)?);
        }

        records.sort_by(|left, right| {
            left.source
                .cmp(&right.source)
                .then(left.target.cmp(&right.target))
                .then(left.sort_name.cmp(&right.sort_name))
                .then(left.id.cmp(&right.id))
        });
        Ok(records)
    }

    fn find_record(&self, id: &str) -> Result<Option<MarkdownDiagramEdge>, ServerError> {
        Ok(self
            .load_records()?
            .into_iter()
            .find(|record| record.id == id))
    }
}

#[async_trait]
impl HasMany<DiagramEdge> for DbDiagramEdges {
    async fn find_all(&self, from: usize, to: usize) -> Result<Vec<DiagramEdge>, ServerError> {
        Ok(self
            .load_records()?
            .into_iter()
            .skip(from)
            .take(to.saturating_sub(from))
            .map(MarkdownDiagramEdge::into_edge)
            .collect())
    }

    async fn find_by_identity(&self, id: &str) -> Result<Option<DiagramEdge>, ServerError> {
        Ok(self.find_record(id)?.map(MarkdownDiagramEdge::into_edge))
    }

    async fn size(&self) -> Result<usize, ServerError> {
        Ok(self.load_records()?.len())
    }
}

impl DiagramEdges for DbDiagramEdges {}

#[derive(Debug, Clone)]
struct MarkdownDiagramEdge {
    id: String,
    source: String,
    target: String,
    sort_name: String,
    description: EdgeDescription,
}

impl MarkdownDiagramEdge {
    fn into_edge(self) -> DiagramEdge {
        DiagramEdge::new(self.id, self.description)
    }
}

fn read_markdown_edge(diagram_id: &str, path: &Path) -> Result<MarkdownDiagramEdge, ServerError> {
    let text = fs::read_to_string(path)
        .map_err(|error| fs_error(format!("read association file {}", path.display()), error))?;
    parse_markdown_edge(diagram_id, path.to_path_buf(), &text)
}

fn parse_markdown_edge(
    diagram_id: &str,
    path: PathBuf,
    text: &str,
) -> Result<MarkdownDiagramEdge, ServerError> {
    let (meta, _content) = split_frontmatter(text).map_err(|message| {
        ServerError::Validation(format!(
            "invalid association markdown {}: {message}",
            path.display()
        ))
    })?;

    let id = required_meta(&meta, "id", &path)?;
    let name = required_meta(&meta, "name", &path)?;
    let label = optional_meta(&meta, "label");
    let source = required_meta(&meta, "source", &path)?;
    let target = required_meta(&meta, "target", &path)?;
    let relationship_type = optional_meta(&meta, "relationshipType");
    let direction = optional_meta(&meta, "direction");
    let cardinality = optional_meta(&meta, "cardinality");
    let summary = optional_meta(&meta, "summary");
    let timestamp = file_timestamp(&path);
    let mut data = JsonObject::new();

    data.insert("id".to_string(), json!(id.clone()));
    data.insert("name".to_string(), json!(name.clone()));
    if let Some(label) = &label {
        data.insert("label".to_string(), json!(label));
    }
    data.insert("source".to_string(), json!(source.clone()));
    data.insert("target".to_string(), json!(target.clone()));
    if let Some(relationship_type) = &relationship_type {
        data.insert("relationType".to_string(), json!(relationship_type));
    }
    if let Some(direction) = &direction {
        data.insert("direction".to_string(), json!(direction));
    }
    if let Some(cardinality) = &cardinality {
        data.insert("cardinality".to_string(), json!(cardinality));
    }
    if let Some(summary) = &summary {
        data.insert("summary".to_string(), json!(summary));
    }

    Ok(MarkdownDiagramEdge {
        id: id.clone(),
        source: source.clone(),
        target: target.clone(),
        sort_name: label.unwrap_or_else(|| name.clone()),
        description: EdgeDescription {
            diagram: Ref::new(diagram_id.to_string()),
            source: Ref::new(source),
            target: Ref::new(target),
            logical_relationship: Some(Ref::new(id)),
            source_handle: None,
            target_handle: None,
            kind: Some("animated".to_string()),
            style: JsonObject::new(),
            data,
            animated: true,
            hidden: false,
            marker_start: None,
            marker_end: None,
            path_options: JsonObject::new(),
            interaction_width: None,
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
            "association file {} is missing required metadata {key}",
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
    fn parses_association_markdown_as_diagram_edge() {
        let edge = parse_markdown_edge(
            "diagram-1",
            PathBuf::from("workspace-has-diagrams.md"),
            "---\nid: assoc_workspace_has_diagrams\nkind: association\nname: WorkspaceHasDiagrams\nlabel: Workspace has diagrams\nsource: workspace\ntarget: diagram\nrelationshipType: has_many\ndirection: directed\ncardinality: one-to-many\nsummary: Workspace contains diagrams.\n---\n# Workspace → Diagram\n",
        )
        .unwrap()
        .into_edge();

        assert_eq!(edge.identity(), "assoc_workspace_has_diagrams");
        assert_eq!(edge.diagram_id(), "diagram-1");
        assert_eq!(edge.description().source.id(), "workspace");
        assert_eq!(edge.description().target.id(), "diagram");
        assert_eq!(
            edge.description()
                .logical_relationship
                .as_ref()
                .map(Ref::id),
            Some(&"assoc_workspace_has_diagrams".to_string())
        );
        assert_eq!(
            edge.description().data.get("relationType"),
            Some(&json!("has_many"))
        );
        assert!(edge.description().animated);
    }
}
