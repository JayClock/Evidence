use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::Arc,
};

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sea_orm::TransactionTrait;
use serde_json::json;
use uuid::Uuid;

use crate::domain::{
    Diagram, DiagramDescription, DiagramStatus, DiagramType, DraftEdge, DraftNode, HasMany, Ref,
    ServerError, Viewport, WorkspaceDiagrams,
};

use super::{
    diagram_edges::{delete_edges_for_diagram, insert_edge, DbDiagramEdges},
    diagram_nodes::{delete_nodes_for_diagram, insert_node, DbDiagramNodes},
    diagram_versions::DbDiagramVersions,
    store::{db_error, now, DbStore},
};

pub struct DbWorkspaceDiagrams {
    store: DbStore,
    workspace_id: String,
    diagrams_dir: PathBuf,
}

impl DbWorkspaceDiagrams {
    pub fn new(store: DbStore, workspace_id: String, evidence_root: PathBuf) -> Self {
        Self {
            store,
            workspace_id,
            diagrams_dir: evidence_root.join("diagrams"),
        }
    }

    fn load_records(&self) -> Result<Vec<MarkdownDiagram>, ServerError> {
        if !self.diagrams_dir.exists() {
            return Ok(Vec::new());
        }

        let mut records = Vec::new();
        for entry in fs::read_dir(&self.diagrams_dir).map_err(|error| {
            fs_error(
                format!("read diagram directory {}", self.diagrams_dir.display()),
                error,
            )
        })? {
            let path = entry
                .map_err(|error| fs_error("read diagram directory entry", error))?
                .path();

            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }

            records.push(read_markdown_diagram(&self.workspace_id, &path)?);
        }

        records.sort_by(|left, right| left.title.cmp(&right.title).then(left.id.cmp(&right.id)));
        Ok(records)
    }

    fn find_record(&self, id: &str) -> Result<Option<MarkdownDiagram>, ServerError> {
        Ok(self
            .load_records()?
            .into_iter()
            .find(|record| record.id == id))
    }

    fn write_record(
        &self,
        path: &Path,
        diagram_id: &str,
        desc: DiagramDescription,
    ) -> Result<Diagram, ServerError> {
        fs::create_dir_all(&self.diagrams_dir).map_err(|error| {
            fs_error(
                format!("create diagram directory {}", self.diagrams_dir.display()),
                error,
            )
        })?;

        let title = normalize_title(desc.title)?;
        let document = serialize_markdown_diagram(MarkdownDiagramDocument {
            id: diagram_id,
            title: &title,
            diagram_type: &desc.diagram_type,
            status: &desc.status,
            viewport: &desc.viewport,
        });

        fs::write(path, document)
            .map_err(|error| fs_error(format!("write diagram file {}", path.display()), error))?;

        read_markdown_diagram(&self.workspace_id, path)
            .map(|record| record.into_diagram(self.store.clone()))
    }

    fn new_diagram_path(&self, title: &str) -> Result<(String, PathBuf), ServerError> {
        fs::create_dir_all(&self.diagrams_dir).map_err(|error| {
            fs_error(
                format!("create diagram directory {}", self.diagrams_dir.display()),
                error,
            )
        })?;

        let base_id = normalize_identifier(title).unwrap_or_else(|| Uuid::new_v4().to_string());
        if self.find_record(&base_id)?.is_none() {
            return Ok((
                base_id.clone(),
                self.diagrams_dir.join(format!("{base_id}.md")),
            ));
        }

        loop {
            let suffix = Uuid::new_v4()
                .to_string()
                .split('-')
                .next()
                .unwrap_or_default()
                .to_string();
            let id = format!("{base_id}_{suffix}");
            if self.find_record(&id)?.is_none() {
                return Ok((id.clone(), self.diagrams_dir.join(format!("{id}.md"))));
            }
        }
    }
}

#[async_trait]
impl HasMany<Diagram> for DbWorkspaceDiagrams {
    async fn find_all(&self, from: usize, to: usize) -> Result<Vec<Diagram>, ServerError> {
        Ok(self
            .load_records()?
            .into_iter()
            .skip(from)
            .take(to.saturating_sub(from))
            .map(|record| record.into_diagram(self.store.clone()))
            .collect())
    }

    async fn find_by_identity(&self, id: &str) -> Result<Option<Diagram>, ServerError> {
        Ok(self
            .find_record(id)?
            .map(|record| record.into_diagram(self.store.clone())))
    }

    async fn size(&self) -> Result<usize, ServerError> {
        Ok(self.load_records()?.len())
    }
}

#[async_trait]
impl WorkspaceDiagrams for DbWorkspaceDiagrams {
    async fn add(&self, desc: DiagramDescription) -> Result<Diagram, ServerError> {
        let title = normalize_title(desc.title.clone())?;
        let (diagram_id, path) = self.new_diagram_path(&title)?;
        self.write_record(&path, &diagram_id, desc)
    }

    async fn update(
        &self,
        diagram_id: &str,
        desc: DiagramDescription,
    ) -> Result<Diagram, ServerError> {
        let record = self
            .find_record(diagram_id)?
            .ok_or_else(|| ServerError::NotFound(format!("diagram {diagram_id} not found")))?;
        self.write_record(&record.path, diagram_id, desc)
    }

    async fn delete(&self, diagram_id: &str) -> Result<(), ServerError> {
        let record = self
            .find_record(diagram_id)?
            .ok_or_else(|| ServerError::NotFound(format!("diagram {diagram_id} not found")))?;
        fs::remove_file(&record.path).map_err(|error| {
            fs_error(
                format!("delete diagram file {}", record.path.display()),
                error,
            )
        })?;
        Ok(())
    }

    async fn list(&self, page: u32, page_size: u32) -> Result<(Vec<Diagram>, u64), ServerError> {
        if page == 0 || page_size == 0 {
            return Err(ServerError::Validation(
                "page and pageSize must be greater than 0".to_string(),
            ));
        }
        let rows = self.load_records()?;
        let total = rows.len() as u64;
        let offset = ((page - 1) * page_size) as usize;
        Ok((
            rows.into_iter()
                .skip(offset)
                .take(page_size as usize)
                .map(|record| record.into_diagram(self.store.clone()))
                .collect(),
            total,
        ))
    }

    async fn save_diagram(
        &self,
        diagram_id: &str,
        draft_nodes: Vec<DraftNode>,
        draft_edges: Vec<DraftEdge>,
    ) -> Result<(), ServerError> {
        if diagram_id.trim().is_empty() {
            return Err(ServerError::Validation(
                "diagram id must be provided".to_string(),
            ));
        }
        let record = self
            .find_record(diagram_id)?
            .ok_or_else(|| ServerError::NotFound(format!("diagram {diagram_id} not found")))?;

        let node_ids: HashSet<String> = draft_nodes.iter().map(|node| node.id.clone()).collect();
        for edge in &draft_edges {
            if !node_ids.contains(edge.description.source.id()) {
                return Err(ServerError::Validation(format!(
                    "draft edge source node not found: {}",
                    edge.description.source.id()
                )));
            }
            if !node_ids.contains(edge.description.target.id()) {
                return Err(ServerError::Validation(format!(
                    "draft edge target node not found: {}",
                    edge.description.target.id()
                )));
            }
        }

        let tx = self.store.db().begin().await.map_err(db_error)?;
        delete_edges_for_diagram(&tx, diagram_id).await?;
        delete_nodes_for_diagram(&tx, diagram_id).await?;

        let timestamp = now();
        for node in draft_nodes {
            insert_node(&tx, diagram_id, &node.id, &node.description, &timestamp).await?;
        }
        for edge in draft_edges {
            let id = edge.id.unwrap_or_else(|| Uuid::new_v4().to_string());
            insert_edge(&tx, diagram_id, &id, &edge.description, &timestamp).await?;
        }

        tx.commit().await.map_err(db_error)?;

        let mut description = record.description;
        description.status = DiagramStatus::Draft;
        self.write_record(&record.path, diagram_id, description)?;
        Ok(())
    }

    async fn publish_diagram(&self, diagram_id: &str) -> Result<(), ServerError> {
        let record = self
            .find_record(diagram_id)?
            .ok_or_else(|| ServerError::NotFound(format!("diagram {diagram_id} not found")))?;
        let mut description = record.description;
        description.status = DiagramStatus::Published;
        self.write_record(&record.path, diagram_id, description)?;
        Ok(())
    }
}

#[derive(Debug, Clone)]
struct MarkdownDiagram {
    id: String,
    title: String,
    path: PathBuf,
    description: DiagramDescription,
}

impl MarkdownDiagram {
    fn into_diagram(self, store: DbStore) -> Diagram {
        let diagram_id = self.id.clone();
        Diagram::new(
            self.id,
            self.description,
            Arc::new(DbDiagramNodes::new(store.clone(), diagram_id.clone())),
            Arc::new(DbDiagramEdges::new(store.clone(), diagram_id.clone())),
            Arc::new(DbDiagramVersions::new(store, diagram_id)),
        )
    }
}

struct MarkdownDiagramDocument<'a> {
    id: &'a str,
    title: &'a str,
    diagram_type: &'a DiagramType,
    status: &'a DiagramStatus,
    viewport: &'a Viewport,
}

fn read_markdown_diagram(workspace_id: &str, path: &Path) -> Result<MarkdownDiagram, ServerError> {
    let text = fs::read_to_string(path)
        .map_err(|error| fs_error(format!("read diagram file {}", path.display()), error))?;
    parse_markdown_diagram(workspace_id, path.to_path_buf(), &text)
}

fn parse_markdown_diagram(
    workspace_id: &str,
    path: PathBuf,
    text: &str,
) -> Result<MarkdownDiagram, ServerError> {
    let (meta, _content) = split_frontmatter(text).map_err(|message| {
        ServerError::Validation(format!(
            "invalid diagram markdown {}: {message}",
            path.display()
        ))
    })?;
    let id = required_meta(&meta, "id", &path)?;
    let title = normalize_title(required_meta(&meta, "title", &path)?)?;
    let diagram_type = optional_meta(&meta, "type")
        .as_deref()
        .map(DiagramType::try_from)
        .transpose()?
        .unwrap_or(DiagramType::Fulfillment);
    let status = optional_meta(&meta, "status")
        .as_deref()
        .map(DiagramStatus::try_from)
        .transpose()?
        .unwrap_or(DiagramStatus::Draft);
    let viewport = optional_meta(&meta, "viewport")
        .and_then(|value| serde_json::from_str(&value).ok())
        .unwrap_or_default();
    let timestamp = file_timestamp(&path);

    Ok(MarkdownDiagram {
        id,
        title: title.clone(),
        path,
        description: DiagramDescription {
            workspace: Ref::new(workspace_id.to_string()),
            title,
            diagram_type,
            viewport,
            status,
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

fn serialize_markdown_diagram(document: MarkdownDiagramDocument<'_>) -> String {
    let viewport =
        serde_json::to_string(document.viewport).unwrap_or_else(|_| json!({}).to_string());
    format!(
        "---\nid: {}\ntitle: {}\ntype: {}\nstatus: {}\nviewport: {}\n---\n# {}\n",
        document.id,
        document.title,
        document.diagram_type.as_str(),
        document.status.as_str(),
        viewport,
        document.title,
    )
}

fn required_meta(
    meta: &HashMap<String, String>,
    key: &str,
    path: &Path,
) -> Result<String, ServerError> {
    optional_meta(meta, key).ok_or_else(|| {
        ServerError::Validation(format!(
            "diagram file {} is missing required metadata {key}",
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

fn normalize_title(title: String) -> Result<String, ServerError> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err(ServerError::Validation(
            "diagram title must not be empty".to_string(),
        ));
    }
    Ok(title)
}

fn normalize_identifier(value: &str) -> Option<String> {
    let mut output = String::new();
    let mut last_was_separator = false;

    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            output.push(character.to_ascii_lowercase());
            last_was_separator = false;
        } else if !last_was_separator && !output.is_empty() {
            output.push('_');
            last_was_separator = true;
        }
    }

    let output = output.trim_matches('_').to_string();
    if output.is_empty() {
        None
    } else {
        Some(output)
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
    fn parses_markdown_diagram_metadata() {
        let diagram = parse_markdown_diagram(
            "workspace-1",
            PathBuf::from("diagram.md"),
            "---\nid: fulfillment\ntitle: Fulfillment\ntype: fulfillment\nstatus: draft\nviewport: {\"x\":1.0,\"y\":2.0,\"zoom\":1.5}\n---\n# Fulfillment\n",
        )
        .unwrap();

        assert_eq!(diagram.id, "fulfillment");
        assert_eq!(diagram.description.workspace.id(), "workspace-1");
        assert_eq!(diagram.description.title, "Fulfillment");
        assert_eq!(diagram.description.diagram_type, DiagramType::Fulfillment);
        assert_eq!(diagram.description.status, DiagramStatus::Draft);
        assert_eq!(diagram.description.viewport.x, 1.0);
        assert_eq!(diagram.description.viewport.y, 2.0);
        assert_eq!(diagram.description.viewport.zoom, 1.5);
    }

    #[test]
    fn serializes_diagram_as_markdown() {
        let document = serialize_markdown_diagram(MarkdownDiagramDocument {
            id: "fulfillment",
            title: "Fulfillment",
            diagram_type: &DiagramType::Fulfillment,
            status: &DiagramStatus::Draft,
            viewport: &Viewport::default(),
        });

        assert!(document.starts_with("---\nid: fulfillment\ntitle: Fulfillment\ntype: fulfillment\nstatus: draft\nviewport: "));
        assert!(document.ends_with("---\n# Fulfillment\n"));
    }
}
