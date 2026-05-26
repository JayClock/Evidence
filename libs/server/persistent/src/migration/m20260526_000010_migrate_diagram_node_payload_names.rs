use sea_orm::{ConnectionTrait, DatabaseBackend, DbErr, Statement};
use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m20260526_000010_migrate_diagram_node_payload_names"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let has_kind = manager.has_column("diagram_nodes", "kind").await?;
        let has_node_type = manager.has_column("diagram_nodes", "node_type").await?;
        let has_type = manager.has_column("diagram_nodes", "type").await?;
        let has_data = manager.has_column("diagram_nodes", "data").await?;
        let has_local_data = manager.has_column("diagram_nodes", "local_data").await?;
        let has_style_config = manager.has_column("diagram_nodes", "style_config").await?;

        if !has_kind {
            execute_sql(manager, add_text_column_sql("kind")).await?;
        }
        if has_node_type {
            execute_sql(manager, "UPDATE diagram_nodes SET kind = node_type").await?;
            execute_sql(manager, "ALTER TABLE diagram_nodes DROP COLUMN node_type").await?;
        } else if has_type {
            execute_sql(manager, copy_type_to_kind_sql(manager)).await?;
            execute_sql(manager, drop_type_column_sql(manager)).await?;
        }

        if !has_data {
            execute_sql(manager, add_json_column_sql(manager, "data")).await?;
        }
        if has_local_data {
            execute_sql(manager, "UPDATE diagram_nodes SET data = local_data").await?;
            execute_sql(manager, "ALTER TABLE diagram_nodes DROP COLUMN local_data").await?;
        }
        if has_style_config {
            execute_sql(
                manager,
                "ALTER TABLE diagram_nodes DROP COLUMN style_config",
            )
            .await?;
        }

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let has_kind = manager.has_column("diagram_nodes", "kind").await?;
        let has_node_type = manager.has_column("diagram_nodes", "node_type").await?;
        let has_data = manager.has_column("diagram_nodes", "data").await?;
        let has_local_data = manager.has_column("diagram_nodes", "local_data").await?;
        let has_style_config = manager.has_column("diagram_nodes", "style_config").await?;

        if !has_node_type {
            execute_sql(manager, add_text_column_sql("node_type")).await?;
        }
        if has_kind {
            execute_sql(manager, "UPDATE diagram_nodes SET node_type = kind").await?;
        }

        if !has_style_config {
            execute_sql(manager, add_json_column_sql(manager, "style_config")).await?;
        }
        if !has_local_data {
            execute_sql(manager, add_json_column_sql(manager, "local_data")).await?;
        }
        if has_data {
            execute_sql(manager, "UPDATE diagram_nodes SET local_data = data").await?;
        }

        if has_kind {
            execute_sql(manager, "ALTER TABLE diagram_nodes DROP COLUMN kind").await?;
        }
        if has_data {
            execute_sql(manager, "ALTER TABLE diagram_nodes DROP COLUMN data").await?;
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

fn add_text_column_sql(column: &str) -> String {
    format!("ALTER TABLE diagram_nodes ADD COLUMN {column} TEXT NOT NULL DEFAULT ''")
}

fn add_json_column_sql(manager: &SchemaManager<'_>, column: &str) -> String {
    match manager.get_database_backend() {
        DatabaseBackend::Postgres => {
            format!("ALTER TABLE diagram_nodes ADD COLUMN {column} JSONB NOT NULL DEFAULT '{{}}'::jsonb")
        }
        DatabaseBackend::Sqlite => {
            format!("ALTER TABLE diagram_nodes ADD COLUMN {column} JSON NOT NULL DEFAULT '{{}}'")
        }
        other => unsupported_backend(other).to_string(),
    }
}

fn copy_type_to_kind_sql(manager: &SchemaManager<'_>) -> &'static str {
    match manager.get_database_backend() {
        DatabaseBackend::Postgres | DatabaseBackend::Sqlite => {
            "UPDATE diagram_nodes SET kind = \"type\""
        }
        other => unsupported_backend(other),
    }
}

fn drop_type_column_sql(manager: &SchemaManager<'_>) -> &'static str {
    match manager.get_database_backend() {
        DatabaseBackend::Postgres | DatabaseBackend::Sqlite => {
            "ALTER TABLE diagram_nodes DROP COLUMN \"type\""
        }
        other => unsupported_backend(other),
    }
}

fn unsupported_backend(backend: DatabaseBackend) -> &'static str {
    panic!("unsupported database backend for diagram node payload migration: {backend:?}")
}
