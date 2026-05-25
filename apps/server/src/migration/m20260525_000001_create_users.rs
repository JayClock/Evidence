use sea_orm::{EntityName, Schema};
use sea_orm_migration::prelude::*;

use crate::persistent::entities::users;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m20260525_000001_create_users"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let schema = Schema::new(manager.get_database_backend());

        manager
            .create_table(
                schema
                    .create_table_from_entity(users::Entity)
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
                    .table(users::Entity.table_ref())
                    .if_exists()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}
