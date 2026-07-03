use std::{
    fs,
    path::{Path, PathBuf},
};

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::Deserialize;
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

    fn load_records(&self) -> Result<Vec<YamlDiagramEdge>, ServerError> {
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

            if !is_yaml_file(&path) {
                continue;
            }

            records.push(read_yaml_edge(&self.diagram_id, &path)?);
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

    fn find_record(&self, id: &str) -> Result<Option<YamlDiagramEdge>, ServerError> {
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
            .map(YamlDiagramEdge::into_edge)
            .collect())
    }

    async fn find_by_identity(&self, id: &str) -> Result<Option<DiagramEdge>, ServerError> {
        Ok(self.find_record(id)?.map(YamlDiagramEdge::into_edge))
    }

    async fn size(&self) -> Result<usize, ServerError> {
        Ok(self.load_records()?.len())
    }
}

impl DiagramEdges for DbDiagramEdges {}

#[derive(Debug, Clone)]
struct YamlDiagramEdge {
    id: String,
    source: String,
    target: String,
    sort_name: String,
    description: EdgeDescription,
}

impl YamlDiagramEdge {
    fn into_edge(self) -> DiagramEdge {
        DiagramEdge::new(self.id, self.description)
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YamlAssociationFile {
    id: String,
    kind: Option<String>,
    name: String,
    label: Option<String>,
    source: String,
    target: String,
    #[serde(alias = "relation_type")]
    relationship_type: Option<String>,
    direction: Option<String>,
    cardinality: Option<String>,
    summary: Option<String>,
}

fn read_yaml_edge(diagram_id: &str, path: &Path) -> Result<YamlDiagramEdge, ServerError> {
    let text = fs::read_to_string(path)
        .map_err(|error| fs_error(format!("read association file {}", path.display()), error))?;
    parse_yaml_edge(diagram_id, path.to_path_buf(), &text)
}

fn parse_yaml_edge(
    diagram_id: &str,
    path: PathBuf,
    text: &str,
) -> Result<YamlDiagramEdge, ServerError> {
    let document: YamlAssociationFile = serde_norway::from_str(text).map_err(|error| {
        ServerError::Validation(format!(
            "invalid association yaml {}: {error}",
            path.display()
        ))
    })?;

    let id = required_string(document.id, "id", &path)?;
    let name = required_string(document.name, "name", &path)?;
    let label = optional_string(document.label);
    let source = required_string(document.source, "source", &path)?;
    let target = required_string(document.target, "target", &path)?;
    let relationship_type = optional_string(document.relationship_type);
    let direction = optional_string(document.direction);
    let cardinality = optional_string(document.cardinality);
    let summary = optional_string(document.summary);
    let timestamp = file_timestamp(&path);
    let mut data = JsonObject::new();

    data.insert("id".to_string(), json!(id.clone()));
    if let Some(kind) = optional_string(document.kind) {
        data.insert("kind".to_string(), json!(kind));
    }
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

    Ok(YamlDiagramEdge {
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

fn required_string(value: String, key: &str, path: &Path) -> Result<String, ServerError> {
    let value = value.trim().to_string();
    if value.is_empty() {
        Err(ServerError::Validation(format!(
            "association file {} is missing required field {key}",
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
    fn parses_association_yaml_as_diagram_edge() {
        let edge = parse_yaml_edge(
            "diagram-1",
            PathBuf::from("workspace-has-diagrams.yaml"),
            "id: assoc_workspace_has_diagrams\nkind: association\nname: WorkspaceHasDiagram\nlabel: Workspace has diagram\nsource: workspace\ntarget: diagram\nrelationshipType: has_one\ndirection: directed\ncardinality: one-to-one\nsummary: Workspace contains one diagram.\n",
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
            Some(&json!("has_one"))
        );
        assert_eq!(
            edge.description().data.get("kind"),
            Some(&json!("association"))
        );
        assert!(edge.description().animated);
    }

    #[test]
    fn yaml_extensions_are_model_files() {
        assert!(is_yaml_file(Path::new("association.yaml")));
        assert!(is_yaml_file(Path::new("association.yml")));
        assert!(!is_yaml_file(Path::new("association.md")));
    }
}
