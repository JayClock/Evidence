use async_trait::async_trait;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder,
    QuerySelect, Set,
};
use uuid::Uuid;

use crate::domain::{HasMany, Member, MemberDescription, Ref, ServerError, WorkspaceMembers};

use super::{
    entities::{users, workspace_members, workspaces},
    store::{
        db_conflict, db_error, default_if_blank, member_to_record, now, MemberRecord, PgStore,
    },
};

pub struct PgWorkspaceMembers {
    store: PgStore,
    workspace_id: String,
}

impl PgWorkspaceMembers {
    pub fn new(store: PgStore, workspace_id: String) -> Self {
        Self {
            store,
            workspace_id,
        }
    }

    fn record_to_member(record: MemberRecord) -> Member {
        Member::new(
            record.id,
            MemberDescription {
                workspace: Ref::new(record.workspace_id),
                user: Ref::new(record.user_id),
                role: record.role,
                created_at: record.created_at,
                updated_at: record.updated_at,
            },
        )
    }
}

#[async_trait]
impl HasMany<Member> for PgWorkspaceMembers {
    async fn find_all(&self, from: usize, to: usize) -> Result<Vec<Member>, ServerError> {
        let rows = workspace_members::Entity::find()
            .filter(workspace_members::Column::WorkspaceId.eq(self.workspace_id.clone()))
            .order_by_asc(workspace_members::Column::CreatedAt)
            .offset(from as u64)
            .limit(to.saturating_sub(from) as u64)
            .all(self.store.db())
            .await
            .map_err(db_error)?;

        Ok(rows
            .into_iter()
            .map(member_to_record)
            .map(Self::record_to_member)
            .collect())
    }

    async fn find_by_identity(&self, id: &str) -> Result<Option<Member>, ServerError> {
        let record = workspace_members::Entity::find_by_id(id)
            .filter(workspace_members::Column::WorkspaceId.eq(self.workspace_id.clone()))
            .one(self.store.db())
            .await
            .map_err(db_error)?
            .map(member_to_record);

        Ok(record.map(Self::record_to_member))
    }

    async fn size(&self) -> Result<usize, ServerError> {
        let total = workspace_members::Entity::find()
            .filter(workspace_members::Column::WorkspaceId.eq(self.workspace_id.clone()))
            .count(self.store.db())
            .await
            .map_err(db_error)?;

        Ok(total as usize)
    }
}

#[async_trait]
impl WorkspaceMembers for PgWorkspaceMembers {
    async fn add_member(&self, desc: MemberDescription) -> Result<Member, ServerError> {
        let workspace_id = desc.workspace.id().clone();
        if workspace_id != self.workspace_id {
            return Err(ServerError::Validation(format!(
                "member workspace {workspace_id} does not match scoped workspace {}",
                self.workspace_id
            )));
        }

        let user_id = desc.user.id().clone();
        let user_exists = users::Entity::find_by_id(user_id.clone())
            .one(self.store.db())
            .await
            .map_err(db_error)?
            .is_some();
        if !user_exists {
            return Err(ServerError::NotFound(format!("user {user_id} not found")));
        }

        let workspace_exists = workspaces::Entity::find_by_id(self.workspace_id.clone())
            .filter(workspaces::Column::DeletedAt.is_null())
            .one(self.store.db())
            .await
            .map_err(db_error)?
            .is_some();
        if !workspace_exists {
            return Err(ServerError::NotFound(format!(
                "workspace {} not found",
                self.workspace_id
            )));
        }

        let already_member = workspace_members::Entity::find()
            .filter(workspace_members::Column::WorkspaceId.eq(self.workspace_id.clone()))
            .filter(workspace_members::Column::UserId.eq(user_id.clone()))
            .one(self.store.db())
            .await
            .map_err(db_error)?
            .is_some();
        if already_member {
            return Err(ServerError::Conflict(format!(
                "user {user_id} is already a workspace member"
            )));
        }

        let timestamp = now();
        let model = workspace_members::ActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            workspace_id: Set(self.workspace_id.clone()),
            user_id: Set(user_id.clone()),
            role: Set(default_if_blank(desc.role, "member")),
            created_at: Set(timestamp.clone()),
            updated_at: Set(timestamp),
        }
        .insert(self.store.db())
        .await
        .map_err(|error| {
            db_conflict(
                error,
                format!("user {user_id} is already a workspace member"),
            )
        })?;

        Ok(Self::record_to_member(member_to_record(model)))
    }

    async fn remove_member(&self, user_id: &str) -> Result<(), ServerError> {
        let member = workspace_members::Entity::find()
            .filter(workspace_members::Column::WorkspaceId.eq(self.workspace_id.clone()))
            .filter(workspace_members::Column::UserId.eq(user_id.to_string()))
            .one(self.store.db())
            .await
            .map_err(db_error)?
            .ok_or_else(|| {
                ServerError::NotFound(format!("workspace member {user_id} not found"))
            })?;

        workspace_members::Entity::delete_by_id(member.id)
            .exec(self.store.db())
            .await
            .map_err(db_error)?;

        Ok(())
    }
}
