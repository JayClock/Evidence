use sea_orm::{EntityName, Schema};
use sea_orm_migration::prelude::*;

use crate::persistent::entities::workspaces;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m20260525_000002_create_workspaces"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let schema = Schema::new(manager.get_database_backend());

        manager
            .create_table(
                schema
                    .create_table_from_entity(workspaces::Entity)
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
                    .table(workspaces::Entity.table_ref())
                    .if_exists()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}
