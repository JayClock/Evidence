use sea_orm_migration::prelude::*;

mod m20260525_000001_create_users;
mod m20260525_000002_create_workspaces;
mod m20260525_000003_create_members;
mod m20260525_000004_create_diagrams;
mod m20260525_000005_create_logical_entities;
mod m20260525_000006_create_diagram_nodes;
mod m20260525_000007_create_diagram_edges;
mod m20260525_000008_create_diagram_versions;
mod m20260526_000009_migrate_diagram_node_position_object;
mod m20260526_000010_migrate_diagram_node_payload_names;
mod m20260526_000011_migrate_diagram_edge_style;
mod m20260526_000012_expand_diagram_edges;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260525_000001_create_users::Migration),
            Box::new(m20260525_000002_create_workspaces::Migration),
            Box::new(m20260525_000003_create_members::Migration),
            Box::new(m20260525_000004_create_diagrams::Migration),
            Box::new(m20260525_000005_create_logical_entities::Migration),
            Box::new(m20260525_000006_create_diagram_nodes::Migration),
            Box::new(m20260525_000007_create_diagram_edges::Migration),
            Box::new(m20260525_000008_create_diagram_versions::Migration),
            Box::new(m20260526_000009_migrate_diagram_node_position_object::Migration),
            Box::new(m20260526_000010_migrate_diagram_node_payload_names::Migration),
            Box::new(m20260526_000011_migrate_diagram_edge_style::Migration),
            Box::new(m20260526_000012_expand_diagram_edges::Migration),
        ]
    }
}
