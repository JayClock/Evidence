use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::core::{Entity, HasMany, Ref};
use super::ServerError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EntityAttribute {
    pub id: String,
    pub name: String,
    pub label: Option<String>,
    #[serde(rename = "type")]
    pub attribute_type: Option<String>,
    pub description: Option<String>,
    #[serde(default, rename = "isBusinessKey")]
    pub is_business_key: bool,
    #[serde(default)]
    pub relation: bool,
    pub visibility: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EntityBehavior {
    pub id: String,
    pub name: String,
    pub label: Option<String>,
    pub description: Option<String>,
    #[serde(rename = "returnType")]
    pub return_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct EntityDefinition {
    pub description: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub attributes: Vec<EntityAttribute>,
    #[serde(default)]
    pub behaviors: Vec<EntityBehavior>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum LogicalEntityType {
    #[serde(rename = "EVIDENCE", alias = "Evidence", alias = "evidence")]
    Evidence,
    #[serde(rename = "PARTICIPANT", alias = "Participant", alias = "participant")]
    Participant,
    #[serde(rename = "ROLE", alias = "Role", alias = "role")]
    Role,
    #[serde(rename = "CONTEXT", alias = "Context", alias = "context")]
    Context,
}

impl LogicalEntityType {
    pub fn api_value(&self) -> &'static str {
        match self {
            Self::Evidence => "EVIDENCE",
            Self::Participant => "PARTICIPANT",
            Self::Role => "ROLE",
            Self::Context => "CONTEXT",
        }
    }

    pub fn db_value(&self) -> &'static str {
        match self {
            Self::Evidence => "Evidence",
            Self::Participant => "Participant",
            Self::Role => "Role",
            Self::Context => "Context",
        }
    }

    pub fn valid_sub_types(&self) -> &'static [&'static str] {
        match self {
            Self::Evidence => &[
                "rfp",
                "proposal",
                "contract",
                "fulfillment_request",
                "fulfillment_confirmation",
                "other_evidence",
            ],
            Self::Participant => &["party", "thing"],
            Self::Role => &["party", "domain", "3rd system", "context", "evidence"],
            Self::Context => &["bounded_context"],
        }
    }
}

impl TryFrom<&str> for LogicalEntityType {
    type Error = ServerError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value.trim() {
            "EVIDENCE" | "Evidence" | "evidence" => Ok(Self::Evidence),
            "PARTICIPANT" | "Participant" | "participant" => Ok(Self::Participant),
            "ROLE" | "Role" | "role" => Ok(Self::Role),
            "CONTEXT" | "Context" | "context" => Ok(Self::Context),
            other => Err(ServerError::Validation(format!(
                "unknown logical entity type: {other}"
            ))),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogicalEntityDescription {
    pub workspace: Ref<String>,
    #[serde(rename = "type")]
    pub entity_type: LogicalEntityType,
    pub sub_type: Option<String>,
    pub name: String,
    pub label: Option<String>,
    pub definition: Option<EntityDefinition>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogicalEntity {
    identity: String,
    description: LogicalEntityDescription,
}

impl LogicalEntity {
    pub fn new(identity: String, description: LogicalEntityDescription) -> Self {
        Self {
            identity,
            description,
        }
    }

    pub fn identity(&self) -> &str {
        &self.identity
    }

    pub fn workspace_id(&self) -> &str {
        self.description.workspace.id()
    }

    pub fn description(&self) -> &LogicalEntityDescription {
        &self.description
    }

    pub fn created_at(&self) -> &str {
        &self.description.created_at
    }

    pub fn updated_at(&self) -> &str {
        &self.description.updated_at
    }
}

impl Entity for LogicalEntity {
    type Identity = str;
    type Description = LogicalEntityDescription;

    fn identity(&self) -> &Self::Identity {
        &self.identity
    }

    fn description(&self) -> &Self::Description {
        &self.description
    }
}

#[async_trait]
pub trait WorkspaceLogicalEntities: HasMany<LogicalEntity> {
    async fn add(&self, desc: LogicalEntityDescription) -> Result<LogicalEntity, ServerError>;

    async fn update(
        &self,
        entity_id: &str,
        desc: LogicalEntityDescription,
    ) -> Result<LogicalEntity, ServerError>;

    async fn delete(&self, entity_id: &str) -> Result<(), ServerError>;

    async fn list(
        &self,
        page: u32,
        page_size: u32,
    ) -> Result<(Vec<LogicalEntity>, u64), ServerError>;
}

pub fn normalize_sub_type(
    entity_type: &LogicalEntityType,
    value: Option<String>,
) -> Result<Option<String>, ServerError> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }

    let raw = if let Some((prefix, raw)) = value.split_once(':') {
        if prefix.trim() != entity_type.api_value() {
            return Err(ServerError::Validation(format!(
                "subType prefix {prefix} does not match logical entity type {}",
                entity_type.api_value()
            )));
        }
        raw.trim()
    } else {
        value
    };

    if entity_type
        .valid_sub_types()
        .iter()
        .any(|candidate| candidate.eq_ignore_ascii_case(raw))
    {
        Ok(Some(raw.to_string()))
    } else {
        Err(ServerError::Validation(format!(
            "unknown {} subType: {raw}",
            entity_type.api_value()
        )))
    }
}

pub fn format_sub_type(entity_type: &LogicalEntityType, sub_type: Option<&str>) -> Option<String> {
    sub_type.map(|sub_type| format!("{}:{sub_type}", entity_type.api_value()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logical_entity_type_accepts_api_and_db_values() {
        assert_eq!(
            LogicalEntityType::try_from("EVIDENCE").unwrap(),
            LogicalEntityType::Evidence
        );
        assert_eq!(
            LogicalEntityType::try_from("Evidence").unwrap(),
            LogicalEntityType::Evidence
        );
    }

    #[test]
    fn sub_type_round_trips_prefixed_value() {
        let sub_type = normalize_sub_type(
            &LogicalEntityType::Evidence,
            Some("EVIDENCE:rfp".to_string()),
        )
        .unwrap();
        assert_eq!(sub_type.as_deref(), Some("rfp"));
        assert_eq!(
            format_sub_type(&LogicalEntityType::Evidence, sub_type.as_deref()).as_deref(),
            Some("EVIDENCE:rfp")
        );
    }

    #[test]
    fn rejects_sub_type_for_other_entity_type() {
        let error = normalize_sub_type(
            &LogicalEntityType::Participant,
            Some("EVIDENCE:rfp".to_string()),
        )
        .unwrap_err();
        assert!(matches!(error, ServerError::Validation(_)));
    }
}
