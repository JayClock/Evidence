use sea_orm::{EntityName, Schema};
use sea_orm_migration::prelude::*;

use crate::persistent::entities::workspace_members;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m20260525_000003_create_members"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let schema = Schema::new(manager.get_database_backend());

        manager
            .create_table(
                schema
                    .create_table_from_entity(workspace_members::Entity)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_members_workspace_user")
                    .table(workspace_members::Entity)
                    .col(workspace_members::Column::WorkspaceId)
                    .col(workspace_members::Column::UserId)
                    .unique()
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(
                Table::drop()
                    .table(workspace_members::Entity.table_ref())
                    .if_exists()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}
