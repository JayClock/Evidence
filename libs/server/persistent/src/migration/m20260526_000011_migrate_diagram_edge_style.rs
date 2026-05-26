use sea_orm::{ConnectionTrait, DatabaseBackend, DbErr, Statement};
use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m20260526_000011_migrate_diagram_edge_style"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let has_style = manager.has_column("diagram_edges", "style").await?;
        let has_style_props = manager.has_column("diagram_edges", "style_props").await?;

        if !has_style {
            execute_sql(manager, add_json_column_sql(manager, "style")).await?;
        }
        if has_style_props {
            execute_sql(manager, "UPDATE diagram_edges SET style = style_props").await?;
            execute_sql(manager, "ALTER TABLE diagram_edges DROP COLUMN style_props").await?;
        }

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let has_style = manager.has_column("diagram_edges", "style").await?;
        let has_style_props = manager.has_column("diagram_edges", "style_props").await?;

        if !has_style_props {
            execute_sql(manager, add_json_column_sql(manager, "style_props")).await?;
        }
        if has_style {
            execute_sql(manager, "UPDATE diagram_edges SET style_props = style").await?;
            execute_sql(manager, "ALTER TABLE diagram_edges DROP COLUMN style").await?;
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

fn add_json_column_sql(manager: &SchemaManager<'_>, column: &str) -> String {
    match manager.get_database_backend() {
        DatabaseBackend::Postgres => {
            format!("ALTER TABLE diagram_edges ADD COLUMN {column} JSONB NOT NULL DEFAULT '{{}}'::jsonb")
        }
        DatabaseBackend::Sqlite => {
            format!("ALTER TABLE diagram_edges ADD COLUMN {column} JSON NOT NULL DEFAULT '{{}}'")
        }
        other => unsupported_backend(other).to_string(),
    }
}

fn unsupported_backend(backend: DatabaseBackend) -> &'static str {
    panic!("unsupported database backend for diagram edge style migration: {backend:?}")
}
