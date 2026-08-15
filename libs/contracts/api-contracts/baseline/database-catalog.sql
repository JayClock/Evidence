WITH catalog_rows AS (
    SELECT
        columns.table_name AS "tableName",
        'column' AS kind,
        lpad(columns.ordinal_position::text, 5, '0') AS "sortKey",
        jsonb_build_object(
            'columnName', columns.column_name,
            'ordinalPosition', columns.ordinal_position,
            'dataType', columns.data_type,
            'udtName', columns.udt_name,
            'nullable', columns.is_nullable = 'YES',
            'defaultValue', columns.column_default
        ) AS description
    FROM information_schema.columns
    WHERE
        columns.table_schema = 'public'
        AND columns.table_name NOT IN (
            '_prisma_migrations', 'flyway_schema_history'
        )

    UNION ALL

    SELECT
        relation.relname AS "tableName",
        'constraint' AS kind,
        constraint_row.conname AS "sortKey",
        jsonb_build_object(
            'name', constraint_row.conname,
            'type', constraint_row.contype,
            'definition', pg_get_constraintdef(constraint_row.oid, true)
        ) AS description
    FROM pg_constraint AS constraint_row
    INNER JOIN pg_class AS relation ON constraint_row.conrelid = relation.oid
    INNER JOIN
        pg_namespace AS namespace
        ON relation.relnamespace = namespace.oid
    WHERE
        namespace.nspname = 'public'
        AND relation.relkind = 'r'
        AND relation.relname NOT IN (
            '_prisma_migrations', 'flyway_schema_history'
        )

    UNION ALL

    SELECT
        indexes.tablename AS "tableName",
        'index' AS kind,
        indexes.indexname AS "sortKey",
        jsonb_build_object(
            'name', indexes.indexname,
            'definition', indexes.indexdef
        ) AS description
    FROM pg_indexes AS indexes
    WHERE
        indexes.schemaname = 'public'
        AND indexes.tablename NOT IN (
            '_prisma_migrations', 'flyway_schema_history'
        )
)

SELECT
    "tableName",
    kind,
    description
FROM catalog_rows
ORDER BY "tableName", kind, "sortKey";
