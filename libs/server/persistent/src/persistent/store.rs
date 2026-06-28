use std::{
    collections::HashMap,
    env, fs,
    path::{Path, PathBuf},
};

use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseBackend, DatabaseConnection, DbErr,
    EntityTrait, QueryFilter, Set, Statement,
};

use crate::domain::ServerError;

use super::entities::{users, workspace_members, workspaces};

const REPOSITORY_ROOT_METADATA_KEY: &str = "repositoryRoot";
const EVIDENCE_ROOT_METADATA_KEY: &str = "evidenceRoot";
const PATH_METADATA_KEY: &str = "path";
const ROOT_PATH_METADATA_KEY: &str = "rootPath";

#[derive(Debug, Clone)]
pub(super) struct UserRecord {
    pub(super) id: String,
    pub(super) name: String,
    pub(super) email: Option<String>,
}

#[derive(Debug, Clone)]
pub(super) struct WorkspaceRecord {
    pub(super) id: String,
    pub(super) title: String,
    pub(super) description: Option<String>,
    pub(super) status: String,
    pub(super) metadata: HashMap<String, String>,
    pub(super) created_at: String,
    pub(super) updated_at: String,
}

#[derive(Debug, Clone)]
pub(super) struct MemberRecord {
    pub(super) id: String,
    pub(super) workspace_id: String,
    pub(super) user_id: String,
    pub(super) role: String,
    pub(super) created_at: String,
    pub(super) updated_at: String,
}

#[derive(Clone)]
pub(super) struct DbStore {
    db: DatabaseConnection,
}

impl DbStore {
    pub(super) fn new(db: DatabaseConnection) -> Self {
        Self { db }
    }

    pub(super) fn db(&self) -> &DatabaseConnection {
        &self.db
    }
}

pub(super) async fn configure_database(db: &DatabaseConnection) -> Result<(), ServerError> {
    if db.get_database_backend() == DatabaseBackend::Sqlite {
        for statement in [
            "PRAGMA foreign_keys = ON",
            "PRAGMA busy_timeout = 5000",
            "PRAGMA journal_mode = WAL",
        ] {
            db.execute(Statement::from_string(
                DatabaseBackend::Sqlite,
                statement.to_string(),
            ))
            .await
            .map_err(db_error)?;
        }
    }

    Ok(())
}

pub(super) async fn seed_defaults(db: &DatabaseConnection) -> Result<(), ServerError> {
    let timestamp = now();
    let user_id = "desktop-user";
    let workspace_id = "default-workspace";
    let member_id = "default-workspace-owner";

    if users::Entity::find_by_id(user_id)
        .one(db)
        .await
        .map_err(db_error)?
        .is_none()
    {
        users::ActiveModel {
            id: Set(user_id.to_string()),
            name: Set("Desktop User".to_string()),
            email: Set(Some("desktop@evidence.local".to_string())),
        }
        .insert(db)
        .await
        .map_err(db_error)?;
    }

    if workspaces::Entity::find_by_id(workspace_id)
        .one(db)
        .await
        .map_err(db_error)?
        .is_none()
    {
        workspaces::ActiveModel {
            id: Set(workspace_id.to_string()),
            title: Set("Default Workspace".to_string()),
            description: Set(Some("Seed workspace for local desktop usage".to_string())),
            status: Set("active".to_string()),
            metadata: Set(metadata_to_json(normalize_workspace_metadata(
                HashMap::new(),
            )?)),
            created_at: Set(timestamp.clone()),
            updated_at: Set(timestamp.clone()),
            deleted_at: Set(None),
        }
        .insert(db)
        .await
        .map_err(db_error)?;
    }

    let member_exists = workspace_members::Entity::find()
        .filter(workspace_members::Column::WorkspaceId.eq(workspace_id))
        .filter(workspace_members::Column::UserId.eq(user_id))
        .one(db)
        .await
        .map_err(db_error)?
        .is_some();

    if !member_exists {
        workspace_members::ActiveModel {
            id: Set(member_id.to_string()),
            workspace_id: Set(workspace_id.to_string()),
            user_id: Set(user_id.to_string()),
            role: Set("owner".to_string()),
            created_at: Set(timestamp.clone()),
            updated_at: Set(timestamp),
        }
        .insert(db)
        .await
        .map_err(db_error)?;
    }

    Ok(())
}

pub(super) fn user_to_record(model: users::Model) -> UserRecord {
    UserRecord {
        id: model.id,
        name: model.name,
        email: model.email,
    }
}

pub(super) fn workspace_to_record(model: workspaces::Model) -> WorkspaceRecord {
    WorkspaceRecord {
        id: model.id,
        title: model.title,
        description: model.description,
        status: model.status,
        metadata: metadata_from_json(model.metadata),
        created_at: model.created_at,
        updated_at: model.updated_at,
    }
}

pub(super) fn member_to_record(model: workspace_members::Model) -> MemberRecord {
    MemberRecord {
        id: model.id,
        workspace_id: model.workspace_id,
        user_id: model.user_id,
        role: model.role,
        created_at: model.created_at,
        updated_at: model.updated_at,
    }
}

pub(super) fn metadata_to_json(metadata: HashMap<String, String>) -> sea_orm::JsonValue {
    serde_json::to_value(metadata)
        .unwrap_or_else(|_| sea_orm::JsonValue::Object(Default::default()))
}

fn metadata_from_json(metadata: sea_orm::JsonValue) -> HashMap<String, String> {
    serde_json::from_value(metadata).unwrap_or_default()
}

pub(super) fn normalize_workspace_metadata(
    mut metadata: HashMap<String, String>,
) -> Result<HashMap<String, String>, ServerError> {
    let repository_root = workspace_repository_root(&metadata)?;
    let evidence_root = repository_root.join(".evidence");
    initialize_evidence_directory(&evidence_root)?;

    metadata.insert(
        REPOSITORY_ROOT_METADATA_KEY.to_string(),
        repository_root.display().to_string(),
    );
    metadata.insert(
        EVIDENCE_ROOT_METADATA_KEY.to_string(),
        evidence_root.display().to_string(),
    );
    Ok(metadata)
}

pub(super) fn evidence_root_from_metadata(metadata: &HashMap<String, String>) -> PathBuf {
    metadata
        .get(EVIDENCE_ROOT_METADATA_KEY)
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .or_else(|| {
            metadata
                .get(REPOSITORY_ROOT_METADATA_KEY)
                .filter(|value| !value.trim().is_empty())
                .map(|value| PathBuf::from(value).join(".evidence"))
        })
        .unwrap_or_else(|| PathBuf::from(".evidence"))
}

pub(super) fn workspace_title_from_metadata(metadata: &HashMap<String, String>) -> Option<String> {
    metadata
        .get(REPOSITORY_ROOT_METADATA_KEY)
        .and_then(|root| Path::new(root).file_name())
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .map(ToString::to_string)
}

fn workspace_repository_root(metadata: &HashMap<String, String>) -> Result<PathBuf, ServerError> {
    let raw_path = [
        REPOSITORY_ROOT_METADATA_KEY,
        PATH_METADATA_KEY,
        ROOT_PATH_METADATA_KEY,
    ]
    .into_iter()
    .find_map(|key| metadata.get(key).filter(|value| !value.trim().is_empty()));

    let path = match raw_path {
        Some(path) => PathBuf::from(path),
        None => env::current_dir().map_err(|error| {
            ServerError::Internal(format!("resolve current workspace directory: {error}"))
        })?,
    };

    let repository_root = fs::canonicalize(&path).map_err(|error| {
        ServerError::Validation(format!(
            "workspace path {} is not accessible: {error}",
            path.display()
        ))
    })?;

    if !repository_root.is_dir() {
        return Err(ServerError::Validation(format!(
            "workspace path {} is not a directory",
            repository_root.display()
        )));
    }

    Ok(repository_root)
}

fn initialize_evidence_directory(evidence_root: &Path) -> Result<(), ServerError> {
    for directory in [
        evidence_root.to_path_buf(),
        evidence_root.join("entities"),
        evidence_root.join("associations"),
    ] {
        fs::create_dir_all(&directory).map_err(|error| {
            ServerError::Internal(format!(
                "create evidence directory {}: {error}",
                directory.display()
            ))
        })?;
    }

    Ok(())
}

pub(super) fn db_error(error: DbErr) -> ServerError {
    ServerError::Internal(format!("database error: {error}"))
}

pub(super) fn db_conflict(error: DbErr, message: String) -> ServerError {
    let text = error.to_string();

    if matches!(error, DbErr::RecordNotInserted | DbErr::RecordNotUpdated)
        || text.contains("duplicate key")
        || text.contains("violates unique constraint")
        || text.contains("UNIQUE constraint failed")
    {
        ServerError::Conflict(message)
    } else {
        db_error(error)
    }
}

pub(super) fn now() -> String {
    Utc::now().to_rfc3339()
}

pub(super) fn default_if_blank(value: String, default_value: &str) -> String {
    let value = value.trim().to_string();
    if value.is_empty() {
        default_value.to_string()
    } else {
        value
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;

    #[test]
    fn metadata_json_round_trips() {
        let metadata = HashMap::from([
            ("color".to_string(), "blue".to_string()),
            ("icon".to_string(), "book".to_string()),
        ]);

        let json = metadata_to_json(metadata.clone());
        let actual = metadata_from_json(json);

        assert_eq!(actual, metadata);
    }

    #[test]
    fn normalizes_workspace_metadata_from_selected_directory() {
        let repository_root =
            std::env::temp_dir().join(format!("evidence-workspace-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&repository_root).unwrap();

        let metadata = normalize_workspace_metadata(HashMap::from([(
            "path".to_string(),
            repository_root.display().to_string(),
        )]))
        .unwrap();

        let repository_root = std::fs::canonicalize(&repository_root).unwrap();
        let evidence_root = repository_root.join(".evidence");
        assert_eq!(
            metadata
                .get(REPOSITORY_ROOT_METADATA_KEY)
                .map(String::as_str),
            Some(repository_root.display().to_string().as_str())
        );
        assert_eq!(
            metadata.get(EVIDENCE_ROOT_METADATA_KEY).map(String::as_str),
            Some(evidence_root.display().to_string().as_str())
        );
        assert!(evidence_root.join("entities").is_dir());
        assert!(evidence_root.join("associations").is_dir());
        assert_eq!(
            workspace_title_from_metadata(&metadata).as_deref(),
            repository_root.file_name().and_then(|name| name.to_str())
        );

        std::fs::remove_dir_all(repository_root).unwrap();
    }

    #[test]
    fn workspace_model_maps_to_record() {
        let metadata = HashMap::from([("purpose".to_string(), "research".to_string())]);
        let record = workspace_to_record(workspaces::Model {
            id: "workspace-1".to_string(),
            title: "Research".to_string(),
            description: Some("notes".to_string()),
            status: "active".to_string(),
            metadata: metadata_to_json(metadata.clone()),
            created_at: "created".to_string(),
            updated_at: "updated".to_string(),
            deleted_at: None,
        });

        assert_eq!(record.id, "workspace-1");
        assert_eq!(record.title, "Research");
        assert_eq!(record.description.as_deref(), Some("notes"));
        assert_eq!(record.status, "active");
        assert_eq!(record.metadata, metadata);
        assert_eq!(record.created_at, "created");
        assert_eq!(record.updated_at, "updated");
    }

    #[test]
    fn user_and_member_models_map_to_records() {
        let user = user_to_record(users::Model {
            id: "user-1".to_string(),
            name: "Ada".to_string(),
            email: Some("ada@example.com".to_string()),
        });
        let member = member_to_record(workspace_members::Model {
            id: "member-1".to_string(),
            workspace_id: "workspace-1".to_string(),
            user_id: "user-1".to_string(),
            role: "owner".to_string(),
            created_at: "created".to_string(),
            updated_at: "updated".to_string(),
        });

        assert_eq!(user.id, "user-1");
        assert_eq!(user.name, "Ada");
        assert_eq!(user.email.as_deref(), Some("ada@example.com"));
        assert_eq!(member.id, "member-1");
        assert_eq!(member.workspace_id, "workspace-1");
        assert_eq!(member.user_id, "user-1");
        assert_eq!(member.role, "owner");
    }
}
