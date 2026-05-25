pub mod users {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
    #[sea_orm(table_name = "users")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub name: String,
        pub email: Option<String>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(has_many = "super::workspace_members::Entity")]
        WorkspaceMembers,
    }

    impl Related<super::workspace_members::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::WorkspaceMembers.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}

pub mod workspaces {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "workspaces")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub title: String,
        pub description: Option<String>,
        pub status: String,
        pub metadata: Json,
        pub created_at: String,
        pub updated_at: String,
        pub deleted_at: Option<String>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(has_many = "super::workspace_members::Entity")]
        WorkspaceMembers,
        #[sea_orm(has_many = "super::workspace_diagrams::Entity")]
        WorkspaceDiagrams,
        #[sea_orm(has_many = "super::logical_entities::Entity")]
        LogicalEntities,
    }

    impl Related<super::workspace_members::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::WorkspaceMembers.def()
        }
    }

    impl Related<super::workspace_diagrams::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::WorkspaceDiagrams.def()
        }
    }

    impl Related<super::logical_entities::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::LogicalEntities.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}

pub mod logical_entities {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "logical_entities")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub workspace_id: String,
        #[sea_orm(column_name = "type")]
        pub entity_type: String,
        pub sub_type: Option<String>,
        pub name: String,
        pub label: Option<String>,
        pub definition: Json,
        pub created_at: String,
        pub updated_at: String,
        pub deleted_at: Option<String>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(
            belongs_to = "super::workspaces::Entity",
            from = "Column::WorkspaceId",
            to = "super::workspaces::Column::Id"
        )]
        Workspace,
    }

    impl Related<super::workspaces::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Workspace.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}

pub mod workspace_diagrams {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "workspace_diagrams")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub workspace_id: String,
        pub title: String,
        pub diagram_type: String,
        pub status: String,
        pub viewport: Json,
        pub created_at: String,
        pub updated_at: String,
        pub deleted_at: Option<String>,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(
            belongs_to = "super::workspaces::Entity",
            from = "Column::WorkspaceId",
            to = "super::workspaces::Column::Id"
        )]
        Workspace,
        #[sea_orm(has_many = "super::diagram_nodes::Entity")]
        DiagramNodes,
        #[sea_orm(has_many = "super::diagram_edges::Entity")]
        DiagramEdges,
        #[sea_orm(has_many = "super::diagram_versions::Entity")]
        DiagramVersions,
    }

    impl Related<super::workspaces::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Workspace.def()
        }
    }

    impl Related<super::diagram_nodes::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::DiagramNodes.def()
        }
    }

    impl Related<super::diagram_edges::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::DiagramEdges.def()
        }
    }

    impl Related<super::diagram_versions::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::DiagramVersions.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}

pub mod diagram_nodes {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "diagram_nodes")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub diagram_id: String,
        pub node_type: String,
        pub logical_entity_id: Option<String>,
        pub parent_id: Option<String>,
        pub position_x: f64,
        pub position_y: f64,
        pub width: Option<i64>,
        pub height: Option<i64>,
        pub style_config: Json,
        pub local_data: Json,
        pub created_at: String,
        pub updated_at: String,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(
            belongs_to = "super::workspace_diagrams::Entity",
            from = "Column::DiagramId",
            to = "super::workspace_diagrams::Column::Id"
        )]
        Diagram,
    }

    impl Related<super::workspace_diagrams::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Diagram.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}

pub mod diagram_edges {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "diagram_edges")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub diagram_id: String,
        pub source_node_id: String,
        pub target_node_id: String,
        pub source_handle: Option<String>,
        pub target_handle: Option<String>,
        pub relation_type: Option<String>,
        pub label: Option<String>,
        pub style_props: Json,
        pub hidden: bool,
        pub created_at: String,
        pub updated_at: String,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(
            belongs_to = "super::workspace_diagrams::Entity",
            from = "Column::DiagramId",
            to = "super::workspace_diagrams::Column::Id"
        )]
        Diagram,
    }

    impl Related<super::workspace_diagrams::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Diagram.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}

pub mod diagram_versions {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
    #[sea_orm(table_name = "diagram_versions")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub diagram_id: String,
        pub version_name: String,
        pub snapshot: Json,
        pub created_at: String,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(
            belongs_to = "super::workspace_diagrams::Entity",
            from = "Column::DiagramId",
            to = "super::workspace_diagrams::Column::Id"
        )]
        Diagram,
    }

    impl Related<super::workspace_diagrams::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Diagram.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}

pub mod workspace_members {
    use sea_orm::entity::prelude::*;

    #[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
    #[sea_orm(table_name = "workspace_members")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub workspace_id: String,
        pub user_id: String,
        pub role: String,
        pub created_at: String,
        pub updated_at: String,
    }

    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {
        #[sea_orm(
            belongs_to = "super::workspaces::Entity",
            from = "Column::WorkspaceId",
            to = "super::workspaces::Column::Id"
        )]
        Workspace,
        #[sea_orm(
            belongs_to = "super::users::Entity",
            from = "Column::UserId",
            to = "super::users::Column::Id"
        )]
        User,
    }

    impl Related<super::workspaces::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::Workspace.def()
        }
    }

    impl Related<super::users::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::User.def()
        }
    }

    impl ActiveModelBehavior for ActiveModel {}
}
