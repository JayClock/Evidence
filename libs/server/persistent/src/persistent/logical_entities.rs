use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::domain::{
    normalize_sub_type, HasMany, LogicalEntity, LogicalEntityDescription, LogicalEntityType, Ref,
    ServerError, WorkspaceLogicalEntities,
};

use super::store::DbStore;

pub struct DbWorkspaceLogicalEntities {
    workspace_id: String,
    entities_dir: PathBuf,
}

impl DbWorkspaceLogicalEntities {
    pub fn new(_store: DbStore, workspace_id: String, evidence_root: PathBuf) -> Self {
        Self {
            workspace_id,
            entities_dir: evidence_root.join("entities"),
        }
    }

    fn load_records(&self) -> Result<Vec<MarkdownLogicalEntity>, ServerError> {
        if !self.entities_dir.exists() {
            return Ok(Vec::new());
        }

        let mut records = Vec::new();
        for entry in fs::read_dir(&self.entities_dir).map_err(|error| {
            fs_error(
                format!(
                    "read logical entity directory {}",
                    self.entities_dir.display()
                ),
                error,
            )
        })? {
            let path = entry
                .map_err(|error| fs_error("read logical entity directory entry", error))?
                .path();

            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }

            records.push(read_markdown_entity(&self.workspace_id, &path)?);
        }

        records.sort_by(|left, right| left.name.cmp(&right.name).then(left.id.cmp(&right.id)));
        Ok(records)
    }

    fn find_record(&self, id: &str) -> Result<Option<MarkdownLogicalEntity>, ServerError> {
        Ok(self
            .load_records()?
            .into_iter()
            .find(|record| record.id == id))
    }

    fn write_record(
        &self,
        path: &Path,
        entity_id: &str,
        desc: LogicalEntityDescription,
    ) -> Result<LogicalEntity, ServerError> {
        fs::create_dir_all(&self.entities_dir).map_err(|error| {
            fs_error(
                format!(
                    "create logical entity directory {}",
                    self.entities_dir.display()
                ),
                error,
            )
        })?;

        let entity_type = desc.entity_type;
        let sub_type = normalize_sub_type(&entity_type, desc.sub_type)?;
        let name = normalize_name(desc.name)?;
        let content = desc.description.unwrap_or_default();
        let document = serialize_markdown_entity(MarkdownEntityDocument {
            id: entity_id,
            name: &name,
            label: desc.label.as_deref(),
            entity_type: &entity_type,
            sub_type: sub_type.as_deref(),
            content: &content,
        });

        fs::write(path, document).map_err(|error| {
            fs_error(
                format!("write logical entity file {}", path.display()),
                error,
            )
        })?;

        read_markdown_entity(&self.workspace_id, path).map(MarkdownLogicalEntity::into_entity)
    }

    fn new_entity_path(&self, name: &str) -> Result<(String, PathBuf), ServerError> {
        fs::create_dir_all(&self.entities_dir).map_err(|error| {
            fs_error(
                format!(
                    "create logical entity directory {}",
                    self.entities_dir.display()
                ),
                error,
            )
        })?;

        let base_id = normalize_identifier(name).unwrap_or_else(|| Uuid::new_v4().to_string());
        if self.find_record(&base_id)?.is_none() {
            return Ok((
                base_id.clone(),
                self.entities_dir.join(format!("{base_id}.md")),
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
                return Ok((id.clone(), self.entities_dir.join(format!("{id}.md"))));
            }
        }
    }
}

#[async_trait]
impl HasMany<LogicalEntity> for DbWorkspaceLogicalEntities {
    async fn find_all(&self, from: usize, to: usize) -> Result<Vec<LogicalEntity>, ServerError> {
        Ok(self
            .load_records()?
            .into_iter()
            .skip(from)
            .take(to.saturating_sub(from))
            .map(MarkdownLogicalEntity::into_entity)
            .collect())
    }

    async fn find_by_identity(&self, id: &str) -> Result<Option<LogicalEntity>, ServerError> {
        Ok(self
            .find_record(id)?
            .map(MarkdownLogicalEntity::into_entity))
    }

    async fn size(&self) -> Result<usize, ServerError> {
        Ok(self.load_records()?.len())
    }
}

#[async_trait]
impl WorkspaceLogicalEntities for DbWorkspaceLogicalEntities {
    async fn add(&self, desc: LogicalEntityDescription) -> Result<LogicalEntity, ServerError> {
        let name = normalize_name(desc.name.clone())?;
        let (entity_id, path) = self.new_entity_path(&name)?;
        self.write_record(&path, &entity_id, desc)
    }

    async fn update(
        &self,
        entity_id: &str,
        desc: LogicalEntityDescription,
    ) -> Result<LogicalEntity, ServerError> {
        let record = self.find_record(entity_id)?.ok_or_else(|| {
            ServerError::NotFound(format!("logical entity {entity_id} not found"))
        })?;
        self.write_record(&record.path, entity_id, desc)
    }

    async fn delete(&self, entity_id: &str) -> Result<(), ServerError> {
        let record = self.find_record(entity_id)?.ok_or_else(|| {
            ServerError::NotFound(format!("logical entity {entity_id} not found"))
        })?;
        fs::remove_file(&record.path).map_err(|error| {
            fs_error(
                format!("delete logical entity file {}", record.path.display()),
                error,
            )
        })?;
        Ok(())
    }

    async fn list(
        &self,
        page: u32,
        page_size: u32,
    ) -> Result<(Vec<LogicalEntity>, u64), ServerError> {
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
                .map(MarkdownLogicalEntity::into_entity)
                .collect(),
            total,
        ))
    }
}

#[derive(Debug, Clone)]
struct MarkdownLogicalEntity {
    id: String,
    path: PathBuf,
    description: LogicalEntityDescription,
    name: String,
}

impl MarkdownLogicalEntity {
    fn into_entity(self) -> LogicalEntity {
        LogicalEntity::new(self.id, self.description)
    }
}

struct MarkdownEntityDocument<'a> {
    id: &'a str,
    name: &'a str,
    label: Option<&'a str>,
    entity_type: &'a LogicalEntityType,
    sub_type: Option<&'a str>,
    content: &'a str,
}

fn read_markdown_entity(
    workspace_id: &str,
    path: &Path,
) -> Result<MarkdownLogicalEntity, ServerError> {
    let text = fs::read_to_string(path).map_err(|error| {
        fs_error(
            format!("read logical entity file {}", path.display()),
            error,
        )
    })?;
    parse_markdown_entity(workspace_id, path.to_path_buf(), &text)
}

fn parse_markdown_entity(
    workspace_id: &str,
    path: PathBuf,
    text: &str,
) -> Result<MarkdownLogicalEntity, ServerError> {
    let (meta, content) = split_frontmatter(text).map_err(|message| {
        ServerError::Validation(format!(
            "invalid logical entity markdown {}: {message}",
            path.display()
        ))
    })?;
    let id = required_meta(&meta, "id", &path)?;
    let name = normalize_name(required_meta(&meta, "name", &path)?)?;
    let entity_type = LogicalEntityType::try_from(required_meta(&meta, "type", &path)?.as_str())?;
    let sub_type = normalize_sub_type(&entity_type, optional_meta(&meta, "subType"))?;
    let timestamp = file_timestamp(&path);

    Ok(MarkdownLogicalEntity {
        id,
        path,
        name: name.clone(),
        description: LogicalEntityDescription {
            workspace: Ref::new(workspace_id.to_string()),
            entity_type,
            sub_type,
            name,
            label: optional_meta(&meta, "label"),
            description: Some(content),
            attributes: Vec::new(),
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

fn serialize_markdown_entity(document: MarkdownEntityDocument<'_>) -> String {
    format!(
        "---\nid: {}\nname: {}\nlabel: {}\ntype: {}\nsubType: {}\n---\n{}",
        document.id,
        document.name,
        document.label.unwrap_or_default(),
        document.entity_type.api_value(),
        document.sub_type.unwrap_or_default(),
        document.content,
    )
}

fn required_meta(
    meta: &HashMap<String, String>,
    key: &str,
    path: &Path,
) -> Result<String, ServerError> {
    optional_meta(meta, key).ok_or_else(|| {
        ServerError::Validation(format!(
            "logical entity file {} is missing required metadata {key}",
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

fn normalize_name(name: String) -> Result<String, ServerError> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(ServerError::Validation(
            "logical entity name must not be empty".to_string(),
        ));
    }
    Ok(name)
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
    fn parses_markdown_entity_metadata_and_content() {
        let entity = parse_markdown_entity(
            "workspace-1",
            PathBuf::from("entity.md"),
            "---\nid: customer\nname: Customer\nlabel: 客户\ntype: PARTICIPANT\nsubType: Thing\n---\n# Customer\n\nCustomer content.\n",
        )
        .unwrap();

        assert_eq!(entity.id, "customer");
        assert_eq!(entity.description.workspace.id(), "workspace-1");
        assert_eq!(entity.description.name, "Customer");
        assert_eq!(entity.description.label.as_deref(), Some("客户"));
        assert_eq!(
            entity.description.entity_type,
            LogicalEntityType::Participant
        );
        assert_eq!(entity.description.sub_type.as_deref(), Some("Thing"));
        assert_eq!(
            entity.description.description.as_deref(),
            Some("# Customer\n\nCustomer content.\n")
        );
    }

    #[test]
    fn serializes_content_as_markdown_body() {
        let document = serialize_markdown_entity(MarkdownEntityDocument {
            id: "customer",
            name: "Customer",
            label: Some("客户"),
            entity_type: &LogicalEntityType::Participant,
            sub_type: Some("Thing"),
            content: "# Customer\n",
        });

        assert_eq!(
            document,
            "---\nid: customer\nname: Customer\nlabel: 客户\ntype: PARTICIPANT\nsubType: Thing\n---\n# Customer\n"
        );
    }
}
