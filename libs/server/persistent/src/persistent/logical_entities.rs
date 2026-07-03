use std::{
    fs,
    path::{Path, PathBuf},
};

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use uuid::Uuid;

use crate::domain::{
    normalize_sub_type, EntityAttribute, HasMany, LogicalEntity, LogicalEntityDescription,
    LogicalEntityType, Ref, ServerError, WorkspaceLogicalEntities,
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

    fn load_records(&self) -> Result<Vec<YamlLogicalEntity>, ServerError> {
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

            if !is_yaml_file(&path) {
                continue;
            }

            records.push(read_yaml_entity(&self.workspace_id, &path)?);
        }

        records.sort_by(|left, right| left.name.cmp(&right.name).then(left.id.cmp(&right.id)));
        Ok(records)
    }

    fn find_record(&self, id: &str) -> Result<Option<YamlLogicalEntity>, ServerError> {
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
        parent: Option<&str>,
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
        let document = serialize_yaml_entity(YamlEntityDocument {
            id: entity_id,
            name: &name,
            label: desc.label.as_deref(),
            entity_type: &entity_type,
            sub_type: sub_type.as_deref(),
            parent,
            content: &content,
            attributes: &desc.attributes,
        });

        fs::write(path, document).map_err(|error| {
            fs_error(
                format!("write logical entity file {}", path.display()),
                error,
            )
        })?;

        read_yaml_entity(&self.workspace_id, path).map(YamlLogicalEntity::into_entity)
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
                self.entities_dir.join(format!("{base_id}.yaml")),
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
                return Ok((id.clone(), self.entities_dir.join(format!("{id}.yaml"))));
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
            .map(YamlLogicalEntity::into_entity)
            .collect())
    }

    async fn find_by_identity(&self, id: &str) -> Result<Option<LogicalEntity>, ServerError> {
        Ok(self.find_record(id)?.map(YamlLogicalEntity::into_entity))
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
        self.write_record(&path, &entity_id, desc, None)
    }

    async fn update(
        &self,
        entity_id: &str,
        desc: LogicalEntityDescription,
    ) -> Result<LogicalEntity, ServerError> {
        let record = self.find_record(entity_id)?.ok_or_else(|| {
            ServerError::NotFound(format!("logical entity {entity_id} not found"))
        })?;
        self.write_record(&record.path, entity_id, desc, record.parent.as_deref())
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
                .map(YamlLogicalEntity::into_entity)
                .collect(),
            total,
        ))
    }
}

#[derive(Debug, Clone)]
struct YamlLogicalEntity {
    id: String,
    path: PathBuf,
    description: LogicalEntityDescription,
    name: String,
    parent: Option<String>,
}

impl YamlLogicalEntity {
    fn into_entity(self) -> LogicalEntity {
        LogicalEntity::new(self.id, self.description)
    }
}

struct YamlEntityDocument<'a> {
    id: &'a str,
    name: &'a str,
    label: Option<&'a str>,
    entity_type: &'a LogicalEntityType,
    sub_type: Option<&'a str>,
    parent: Option<&'a str>,
    content: &'a str,
    attributes: &'a [EntityAttribute],
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

fn read_yaml_entity(workspace_id: &str, path: &Path) -> Result<YamlLogicalEntity, ServerError> {
    let text = fs::read_to_string(path).map_err(|error| {
        fs_error(
            format!("read logical entity file {}", path.display()),
            error,
        )
    })?;
    parse_yaml_entity(workspace_id, path.to_path_buf(), &text)
}

fn parse_yaml_entity(
    workspace_id: &str,
    path: PathBuf,
    text: &str,
) -> Result<YamlLogicalEntity, ServerError> {
    let document: YamlEntityFile = serde_norway::from_str(text).map_err(|error| {
        ServerError::Validation(format!(
            "invalid logical entity yaml {}: {error}",
            path.display()
        ))
    })?;
    let id = required_string(document.id, "id", &path)?;
    let name = normalize_name(required_string(document.name, "name", &path)?)?;
    let entity_type = LogicalEntityType::try_from(
        required_string(document.entity_type, "type", &path)?.as_str(),
    )?;
    let sub_type = normalize_sub_type(&entity_type, optional_string(document.sub_type))?;
    let parent = optional_string(document.parent);
    let attributes = document.attributes;
    let content = document
        .content
        .or(document.description)
        .or_else(|| content_attribute(&attributes))
        .unwrap_or_else(|| attributes_to_markdown(&attributes));
    let timestamp = file_timestamp(&path);

    Ok(YamlLogicalEntity {
        id,
        path,
        name: name.clone(),
        parent,
        description: LogicalEntityDescription {
            workspace: Ref::new(workspace_id.to_string()),
            entity_type,
            sub_type,
            name,
            label: optional_string(document.label),
            description: Some(content),
            attributes,
            created_at: timestamp.clone(),
            updated_at: timestamp,
        },
    })
}

fn serialize_yaml_entity(document: YamlEntityDocument<'_>) -> String {
    let mut output = String::new();

    append_yaml_string(&mut output, "id", document.id);
    append_yaml_string(&mut output, "name", document.name);
    append_optional_yaml_string(&mut output, "label", document.label);
    append_yaml_string(&mut output, "type", document.entity_type.api_value());
    append_optional_yaml_string(&mut output, "subType", document.sub_type);
    append_optional_yaml_string(&mut output, "parent", document.parent);

    let mut attributes = document.attributes.to_vec();
    let generated_content = attributes_to_markdown(&attributes);
    if !document.content.trim().is_empty()
        && (attributes.is_empty() || document.content != generated_content)
    {
        upsert_content_attribute(&mut attributes, document.content);
    }
    append_entity_attributes(&mut output, &attributes);

    output
}

fn append_entity_attributes(output: &mut String, attributes: &[EntityAttribute]) {
    if attributes.is_empty() {
        return;
    }

    output.push_str("attributes:\n");
    for attribute in attributes {
        output.push_str("  - ");
        append_yaml_string_after_prefix(output, "id", &attribute.id);
        append_yaml_string_with_indent(output, "    ", "name", &attribute.name);
        append_optional_yaml_string_with_indent(
            output,
            "    ",
            "label",
            attribute.label.as_deref(),
        );
        append_optional_yaml_string_with_indent(
            output,
            "    ",
            "type",
            attribute.attribute_type.as_deref(),
        );
        if let Some(description) = attribute.description.as_deref() {
            append_yaml_block_or_string_with_indent(output, "    ", "description", description);
        }
    }
}

fn append_yaml_string(output: &mut String, key: &str, value: &str) {
    append_yaml_string_with_indent(output, "", key, value);
}

fn append_yaml_string_with_indent(output: &mut String, indent: &str, key: &str, value: &str) {
    output.push_str(indent);
    append_yaml_string_after_prefix(output, key, value);
}

fn append_yaml_string_after_prefix(output: &mut String, key: &str, value: &str) {
    output.push_str(key);
    output.push_str(": ");
    output.push_str(&serde_json::to_string(value).expect("YAML scalar should serialize"));
    output.push('\n');
}

fn append_optional_yaml_string(output: &mut String, key: &str, value: Option<&str>) {
    append_optional_yaml_string_with_indent(output, "", key, value);
}

fn append_optional_yaml_string_with_indent(
    output: &mut String,
    indent: &str,
    key: &str,
    value: Option<&str>,
) {
    if let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) {
        append_yaml_string_with_indent(output, indent, key, value);
    }
}

fn append_yaml_block_or_string_with_indent(
    output: &mut String,
    indent: &str,
    key: &str,
    value: &str,
) {
    if !value.contains('\n') {
        append_yaml_string_with_indent(output, indent, key, value);
        return;
    }

    output.push_str(indent);
    output.push_str(key);
    if value.ends_with('\n') {
        output.push_str(": |\n");
    } else {
        output.push_str(": |-\n");
    }

    for line in value.lines() {
        output.push_str(indent);
        output.push_str("  ");
        output.push_str(line);
        output.push('\n');
    }
}

fn content_attribute(attributes: &[EntityAttribute]) -> Option<String> {
    attributes
        .iter()
        .find(|attribute| attribute.id == "content" || attribute.name == "content")
        .and_then(|attribute| attribute.description.clone())
}

fn upsert_content_attribute(attributes: &mut Vec<EntityAttribute>, content: &str) {
    if let Some(attribute) = attributes
        .iter_mut()
        .find(|attribute| attribute.id == "content" || attribute.name == "content")
    {
        attribute.description = Some(content.to_string());
        return;
    }

    attributes.push(EntityAttribute {
        id: "content".to_string(),
        name: "content".to_string(),
        label: Some("Content".to_string()),
        attribute_type: None,
        description: Some(content.to_string()),
    });
}

fn attributes_to_markdown(attributes: &[EntityAttribute]) -> String {
    if attributes.is_empty() {
        return String::new();
    }

    let mut output = "| Attribute | Value |\n| --- | --- |\n".to_string();
    for attribute in attributes {
        output.push_str("| ");
        output.push_str(&escape_markdown_table_cell(
            attribute.label.as_deref().unwrap_or(&attribute.name),
        ));
        output.push_str(" | ");
        output.push_str(&escape_markdown_table_cell(
            attribute.description.as_deref().unwrap_or_default(),
        ));
        output.push_str(" |\n");
    }
    output
}

fn escape_markdown_table_cell(value: &str) -> String {
    value.replace('|', "\\|").replace('\n', "<br>")
}

fn required_string(value: String, key: &str, path: &Path) -> Result<String, ServerError> {
    let value = value.trim().to_string();
    if value.is_empty() {
        Err(ServerError::Validation(format!(
            "logical entity file {} is missing required field {key}",
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
    fn parses_yaml_entity_metadata_and_attributes() {
        let entity = parse_yaml_entity(
            "workspace-1",
            PathBuf::from("entity.yaml"),
            "id: customer\nname: Customer\nlabel: 客户\ntype: PARTICIPANT\nsubType: Thing\nparent: commerce_context\nattributes:\n  - id: businessNo\n    name: businessNo\n    description: C-001\n",
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
        assert_eq!(entity.parent.as_deref(), Some("commerce_context"));
        assert_eq!(entity.description.attributes.len(), 1);
        assert_eq!(entity.description.attributes[0].id, "businessNo");
        assert_eq!(
            entity.description.description.as_deref(),
            Some("| Attribute | Value |\n| --- | --- |\n| businessNo | C-001 |\n")
        );
    }

    #[test]
    fn serializes_content_as_yaml_attribute() {
        let document = serialize_yaml_entity(YamlEntityDocument {
            id: "customer",
            name: "Customer",
            label: Some("客户"),
            entity_type: &LogicalEntityType::Participant,
            sub_type: Some("Thing"),
            parent: Some("commerce_context"),
            content: "# Customer\n",
            attributes: &[],
        });

        assert_eq!(
            document,
            "id: \"customer\"\nname: \"Customer\"\nlabel: \"客户\"\ntype: \"PARTICIPANT\"\nsubType: \"Thing\"\nparent: \"commerce_context\"\nattributes:\n  - id: \"content\"\n    name: \"content\"\n    label: \"Content\"\n    description: |\n      # Customer\n"
        );
    }

    #[test]
    fn yaml_extensions_are_model_files() {
        assert!(is_yaml_file(Path::new("entity.yaml")));
        assert!(is_yaml_file(Path::new("entity.yml")));
        assert!(!is_yaml_file(Path::new("entity.md")));
    }
}
