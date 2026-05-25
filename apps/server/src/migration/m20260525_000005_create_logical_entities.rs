use sea_orm::{EntityName, Schema};
use sea_orm_migration::prelude::*;

use crate::persistent::entities::logical_entities;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m20260525_000005_create_logical_entities"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let schema = Schema::new(manager.get_database_backend());

        manager
            .create_table(
                schema
                    .create_table_from_entity(logical_entities::Entity)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_logical_entities_workspace_updated")
                    .table(logical_entities::Entity)
                    .col(logical_entities::Column::WorkspaceId)
                    .col(logical_entities::Column::UpdatedAt)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_logical_entities_workspace_type")
                    .table(logical_entities::Entity)
                    .col(logical_entities::Column::WorkspaceId)
                    .col(logical_entities::Column::EntityType)
                    .if_not_exists()
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_logical_entities_workspace_sub_type")
                    .table(logical_entities::Entity)
                    .col(logical_entities::Column::WorkspaceId)
                    .col(logical_entities::Column::SubType)
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
                    .table(logical_entities::Entity.table_ref())
                    .if_exists()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}
