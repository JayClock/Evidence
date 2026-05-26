use sea_orm::{ConnectionTrait, DatabaseBackend, DbErr, Statement};
use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m20260526_000009_migrate_diagram_node_position_object"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let has_position = manager.has_column("diagram_nodes", "position").await?;
        let has_position_x = manager.has_column("diagram_nodes", "position_x").await?;
        let has_position_y = manager.has_column("diagram_nodes", "position_y").await?;

        if !has_position {
            execute_sql(manager, add_position_column_sql(manager)).await?;
        }

        if has_position_x && has_position_y {
            execute_sql(manager, migrate_to_position_object_sql(manager)).await?;
            execute_sql(manager, "ALTER TABLE diagram_nodes DROP COLUMN position_x").await?;
            execute_sql(manager, "ALTER TABLE diagram_nodes DROP COLUMN position_y").await?;
        }

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let has_position = manager.has_column("diagram_nodes", "position").await?;
        let has_position_x = manager.has_column("diagram_nodes", "position_x").await?;
        let has_position_y = manager.has_column("diagram_nodes", "position_y").await?;

        if !has_position_x {
            execute_sql(manager, add_position_axis_column_sql(manager, "position_x")).await?;
        }
        if !has_position_y {
            execute_sql(manager, add_position_axis_column_sql(manager, "position_y")).await?;
        }

        if has_position {
            execute_sql(manager, migrate_to_position_columns_sql(manager)).await?;
            execute_sql(manager, "ALTER TABLE diagram_nodes DROP COLUMN position").await?;
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

fn add_position_column_sql(manager: &SchemaManager<'_>) -> &'static str {
    match manager.get_database_backend() {
        DatabaseBackend::Postgres => {
            "ALTER TABLE diagram_nodes ADD COLUMN position JSONB NOT NULL DEFAULT '{\"x\":0,\"y\":0}'::jsonb"
        }
        DatabaseBackend::Sqlite => {
            "ALTER TABLE diagram_nodes ADD COLUMN position JSON NOT NULL DEFAULT '{\"x\":0,\"y\":0}'"
        }
        other => unsupported_backend(other),
    }
}

fn migrate_to_position_object_sql(manager: &SchemaManager<'_>) -> &'static str {
    match manager.get_database_backend() {
        DatabaseBackend::Postgres => {
            "UPDATE diagram_nodes SET position = jsonb_build_object('x', position_x, 'y', position_y)"
        }
        DatabaseBackend::Sqlite => {
            "UPDATE diagram_nodes SET position = json_object('x', position_x, 'y', position_y)"
        }
        other => unsupported_backend(other),
    }
}

fn add_position_axis_column_sql(manager: &SchemaManager<'_>, column: &str) -> String {
    match manager.get_database_backend() {
        DatabaseBackend::Postgres => {
            format!(
                "ALTER TABLE diagram_nodes ADD COLUMN {column} DOUBLE PRECISION NOT NULL DEFAULT 0"
            )
        }
        DatabaseBackend::Sqlite => {
            format!("ALTER TABLE diagram_nodes ADD COLUMN {column} REAL NOT NULL DEFAULT 0")
        }
        other => unsupported_backend(other).to_string(),
    }
}

fn migrate_to_position_columns_sql(manager: &SchemaManager<'_>) -> &'static str {
    match manager.get_database_backend() {
        DatabaseBackend::Postgres => {
            "UPDATE diagram_nodes SET position_x = COALESCE((position->>'x')::double precision, 0), position_y = COALESCE((position->>'y')::double precision, 0)"
        }
        DatabaseBackend::Sqlite => {
            "UPDATE diagram_nodes SET position_x = COALESCE(json_extract(position, '$.x'), 0), position_y = COALESCE(json_extract(position, '$.y'), 0)"
        }
        other => unsupported_backend(other),
    }
}

fn unsupported_backend(backend: DatabaseBackend) -> &'static str {
    panic!("unsupported database backend for diagram node position migration: {backend:?}")
}
