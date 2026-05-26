use sea_orm::{ConnectionTrait, DatabaseBackend, DbErr, Statement};
use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &str {
        "m20260526_000012_expand_diagram_edges"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        migrate_ref_column(manager, "source_id", "source_node_id").await?;
        migrate_ref_column(manager, "target_id", "target_node_id").await?;

        add_column_if_missing(manager, "kind", add_optional_text_column_sql("kind")).await?;
        add_column_if_missing(
            manager,
            "data",
            add_json_column_sql(manager, "data", JsonDefault::Object),
        )
        .await?;
        add_column_if_missing(
            manager,
            "animated",
            add_bool_column_sql(manager, "animated", false),
        )
        .await?;
        add_column_if_missing(
            manager,
            "marker_start",
            add_json_column_sql(manager, "marker_start", JsonDefault::Null),
        )
        .await?;
        add_column_if_missing(
            manager,
            "marker_end",
            add_json_column_sql(manager, "marker_end", JsonDefault::Null),
        )
        .await?;
        add_column_if_missing(
            manager,
            "path_options",
            add_json_column_sql(manager, "path_options", JsonDefault::Object),
        )
        .await?;
        add_column_if_missing(
            manager,
            "interaction_width",
            add_optional_float_column_sql(manager, "interaction_width"),
        )
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        migrate_ref_column(manager, "source_node_id", "source_id").await?;
        migrate_ref_column(manager, "target_node_id", "target_id").await?;

        for column in [
            "kind",
            "data",
            "animated",
            "marker_start",
            "marker_end",
            "path_options",
            "interaction_width",
        ] {
            drop_column_if_exists(manager, column).await?;
        }

        Ok(())
    }
}

async fn migrate_ref_column(
    manager: &SchemaManager<'_>,
    next_column: &str,
    previous_column: &str,
) -> Result<(), DbErr> {
    let has_next = manager.has_column("diagram_edges", next_column).await?;
    let has_previous = manager.has_column("diagram_edges", previous_column).await?;

    if !has_next {
        execute_sql(manager, add_required_text_column_sql(next_column)).await?;
    }
    if has_previous {
        execute_sql(
            manager,
            format!("UPDATE diagram_edges SET {next_column} = {previous_column}"),
        )
        .await?;
        execute_sql(
            manager,
            format!("ALTER TABLE diagram_edges DROP COLUMN {previous_column}"),
        )
        .await?;
    }

    Ok(())
}

async fn add_column_if_missing(
    manager: &SchemaManager<'_>,
    column: &str,
    sql: impl Into<String>,
) -> Result<(), DbErr> {
    if !manager.has_column("diagram_edges", column).await? {
        execute_sql(manager, sql).await?;
    }
    Ok(())
}

async fn drop_column_if_exists(manager: &SchemaManager<'_>, column: &str) -> Result<(), DbErr> {
    if manager.has_column("diagram_edges", column).await? {
        execute_sql(
            manager,
            format!("ALTER TABLE diagram_edges DROP COLUMN {column}"),
        )
        .await?;
    }
    Ok(())
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

fn add_required_text_column_sql(column: &str) -> String {
    format!("ALTER TABLE diagram_edges ADD COLUMN {column} TEXT NOT NULL DEFAULT ''")
}

fn add_optional_text_column_sql(column: &str) -> String {
    format!("ALTER TABLE diagram_edges ADD COLUMN {column} TEXT")
}

fn add_optional_float_column_sql(manager: &SchemaManager<'_>, column: &str) -> String {
    match manager.get_database_backend() {
        DatabaseBackend::Postgres => {
            format!("ALTER TABLE diagram_edges ADD COLUMN {column} DOUBLE PRECISION")
        }
        DatabaseBackend::Sqlite => format!("ALTER TABLE diagram_edges ADD COLUMN {column} REAL"),
        other => unsupported_backend(other).to_string(),
    }
}

fn add_bool_column_sql(manager: &SchemaManager<'_>, column: &str, default: bool) -> String {
    match manager.get_database_backend() {
        DatabaseBackend::Postgres => format!(
            "ALTER TABLE diagram_edges ADD COLUMN {column} BOOLEAN NOT NULL DEFAULT {}",
            if default { "TRUE" } else { "FALSE" }
        ),
        DatabaseBackend::Sqlite => format!(
            "ALTER TABLE diagram_edges ADD COLUMN {column} BOOLEAN NOT NULL DEFAULT {}",
            if default { 1 } else { 0 }
        ),
        other => unsupported_backend(other).to_string(),
    }
}

fn add_json_column_sql(manager: &SchemaManager<'_>, column: &str, default: JsonDefault) -> String {
    let default = match (manager.get_database_backend(), default) {
        (DatabaseBackend::Postgres, JsonDefault::Object) => "'{}'::jsonb",
        (DatabaseBackend::Postgres, JsonDefault::Null) => "'null'::jsonb",
        (DatabaseBackend::Sqlite, JsonDefault::Object) => "'{}'",
        (DatabaseBackend::Sqlite, JsonDefault::Null) => "'null'",
        (other, _) => return unsupported_backend(other).to_string(),
    };
    let column_type = match manager.get_database_backend() {
        DatabaseBackend::Postgres => "JSONB",
        DatabaseBackend::Sqlite => "JSON",
        other => return unsupported_backend(other).to_string(),
    };

    format!(
        "ALTER TABLE diagram_edges ADD COLUMN {column} {column_type} NOT NULL DEFAULT {default}"
    )
}

#[derive(Clone, Copy)]
enum JsonDefault {
    Object,
    Null,
}

fn unsupported_backend(backend: DatabaseBackend) -> &'static str {
    panic!("unsupported database backend for diagram edge expansion migration: {backend:?}")
}
