use sea_orm::{ConnectionTrait, DbErr, Statement};
use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m20260526_000014_add_diagram_edge_logical_relationship"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if !manager
            .has_column("diagram_edges", "logical_relationship_id")
            .await?
        {
            execute_sql(
                manager,
                "ALTER TABLE diagram_edges ADD COLUMN logical_relationship_id TEXT",
            )
            .await?;
        }

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        if manager
            .has_column("diagram_edges", "logical_relationship_id")
            .await?
        {
            execute_sql(
                manager,
                "ALTER TABLE diagram_edges DROP COLUMN logical_relationship_id",
            )
            .await?;
        }

        Ok(())
    }
}

async fn execute_sql(manager: &SchemaManager<'_>, sql: impl Into<String>) -> Result<(), DbErr> {
    manager
        .get_connection()
        .execute(Statement::from_string(
            manager.get_database_backend(),
            sql.into(),
        ))
        .await
        .map(|_| ())
}
