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
    }

    impl Related<super::workspace_members::Entity> for Entity {
        fn to() -> RelationDef {
            Relation::WorkspaceMembers.def()
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
