use std::sync::Arc;

use async_trait::async_trait;
use sea_orm::{Database, DatabaseConnection, EntityTrait};
use sea_orm_migration::MigratorTrait;

use crate::{
    domain::{ServerError, User, UserDescription, UserWorkspaces, Users},
    migration::Migrator,
};

use super::{
    entities::users,
    store::{configure_database, db_error, seed_defaults, user_to_record, DbStore},
    user_workspaces::DbUserWorkspaces,
};

pub struct DbUsers {
    store: DbStore,
    workspaces: Arc<DbUserWorkspaces>,
}

impl DbUsers {
    pub async fn connect(database_url: &str) -> Result<Self, ServerError> {
        let db = Database::connect(database_url).await.map_err(db_error)?;
        Self::from_connection(db).await
    }

    pub async fn from_connection(db: DatabaseConnection) -> Result<Self, ServerError> {
        configure_database(&db).await?;
        Migrator::up(&db, None).await.map_err(db_error)?;
        seed_defaults(&db).await?;

        let store = DbStore::new(db);
        Ok(Self {
            store: store.clone(),
            workspaces: Arc::new(DbUserWorkspaces::new(store, None)),
        })
    }
}

#[async_trait]
impl Users for DbUsers {
    fn workspaces(&self) -> &dyn UserWorkspaces {
        self.workspaces.as_ref()
    }

    async fn find_by_identity(&self, user_id: &str) -> Result<Option<User>, ServerError> {
        let record = users::Entity::find_by_id(user_id)
            .one(self.store.db())
            .await
            .map_err(db_error)?
            .map(user_to_record);

        Ok(record.map(|record| {
            User::new(
                record.id,
                UserDescription {
                    name: record.name,
                    email: record.email,
                },
                Arc::new(DbUserWorkspaces::new(
                    self.store.clone(),
                    Some(user_id.to_string()),
                )),
            )
        }))
    }
}

#[cfg(all(test, feature = "sqlite-tests"))]
mod sqlite_tests {
    use crate::persistent::test_support::contracts;

    use super::*;

    struct SqliteTestContext {
        users: DbUsers,
        _tempdir: tempfile::TempDir,
    }

    async fn sqlite_test_context() -> SqliteTestContext {
        let tempdir = tempfile::Builder::new()
            .prefix("evidence sqlite ")
            .tempdir()
            .unwrap();
        let database_path = tempdir.path().join("evidence.sqlite");
        let database_url = format!("sqlite://{}?mode=rwc", database_path.display());

        SqliteTestContext {
            users: DbUsers::connect(&database_url).await.unwrap(),
            _tempdir: tempdir,
        }
    }

    #[tokio::test]
    async fn sqlite_user_sees_seed_workspace() {
        let context = sqlite_test_context().await;
        contracts::user_sees_seed_workspace(&context.users).await;
    }

    #[tokio::test]
    async fn sqlite_creating_workspace_adds_owner_member() {
        let context = sqlite_test_context().await;
        contracts::creating_workspace_adds_owner_member(&context.users).await;
    }

    #[tokio::test]
    async fn sqlite_duplicate_member_is_conflict() {
        let context = sqlite_test_context().await;
        contracts::duplicate_member_is_conflict(&context.users).await;
    }

    #[tokio::test]
    async fn sqlite_workspace_logical_entities_crud() {
        let context = sqlite_test_context().await;
        contracts::workspace_logical_entities_crud(&context.users).await;
    }
}

#[cfg(all(test, feature = "postgres-tests"))]
mod postgres_tests {
    use testcontainers::runners::AsyncRunner;
    use testcontainers_modules::postgres::Postgres;

    use crate::persistent::test_support::contracts;

    use super::*;

    struct DbTestContext {
        users: DbUsers,
        _container: Option<testcontainers::ContainerAsync<Postgres>>,
    }

    async fn pg_test_context() -> DbTestContext {
        if let Ok(database_url) = std::env::var("TEST_DATABASE_URL") {
            return DbTestContext {
                users: DbUsers::connect(&database_url).await.unwrap(),
                _container: None,
            };
        }

        let container = Postgres::default().start().await.expect(
            "postgres-tests require Docker or TEST_DATABASE_URL pointing at a disposable PostgreSQL database",
        );
        let host = container.get_host().await.unwrap();
        let port = container.get_host_port_ipv4(5432).await.unwrap();
        let database_url = format!("postgres://postgres:postgres@{host}:{port}/postgres");

        DbTestContext {
            users: DbUsers::connect(&database_url).await.unwrap(),
            _container: Some(container),
        }
    }

    #[tokio::test]
    async fn pg_user_sees_seed_workspace() {
        let context = pg_test_context().await;
        contracts::user_sees_seed_workspace(&context.users).await;
    }

    #[tokio::test]
    async fn pg_creating_workspace_adds_owner_member() {
        let context = pg_test_context().await;
        contracts::creating_workspace_adds_owner_member(&context.users).await;
    }

    #[tokio::test]
    async fn pg_duplicate_member_is_conflict() {
        let context = pg_test_context().await;
        contracts::duplicate_member_is_conflict(&context.users).await;
    }

    #[tokio::test]
    async fn pg_workspace_logical_entities_crud() {
        let context = pg_test_context().await;
        contracts::workspace_logical_entities_crud(&context.users).await;
    }
}
