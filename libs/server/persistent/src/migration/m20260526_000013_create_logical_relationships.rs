use sea_orm::{EntityName, Schema};
use sea_orm_migration::prelude::*;

use crate::persistent::entities::logical_relationships;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m20260526_000013_create_logical_relationships"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let schema = Schema::new(manager.get_database_backend());

        manager
            .create_table(
                schema
                    .create_table_from_entity(logical_relationships::Entity)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_logical_relationships_workspace_source")
                    .table(logical_relationships::Entity)
                    .col(logical_relationships::Column::WorkspaceId)
                    .col(logical_relationships::Column::SourceId)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_logical_relationships_workspace_target")
                    .table(logical_relationships::Entity)
                    .col(logical_relationships::Column::WorkspaceId)
                    .col(logical_relationships::Column::TargetId)
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
                    .table(logical_relationships::Entity.table_ref())
                    .if_exists()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}
