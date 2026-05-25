use std::collections::HashMap;

use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseBackend, DatabaseConnection, DbErr,
    EntityTrait, QueryFilter, Set, Statement,
};

use crate::domain::ServerError;

use super::entities::{users, workspace_members, workspaces};

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
            metadata: Set(metadata_to_json(HashMap::new())),
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
