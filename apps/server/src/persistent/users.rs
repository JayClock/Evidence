use std::sync::Arc;

use async_trait::async_trait;
use sea_orm::{Database, DatabaseConnection, EntityTrait};

use crate::domain::{ServerError, User, UserDescription, UserWorkspaces, Users};

use super::{
    entities::users,
    store::{db_error, init_schema, seed_defaults, user_to_record, PgStore},
    user_workspaces::PgUserWorkspaces,
};

pub struct PgUsers {
    store: PgStore,
    workspaces: Arc<PgUserWorkspaces>,
}

impl PgUsers {
    pub async fn connect(database_url: &str) -> Result<Self, ServerError> {
        let db = Database::connect(database_url).await.map_err(db_error)?;
        Self::from_connection(db).await
    }

    pub async fn from_connection(db: DatabaseConnection) -> Result<Self, ServerError> {
        init_schema(&db).await?;
        seed_defaults(&db).await?;

        let store = PgStore::new(db);
        Ok(Self {
            store: store.clone(),
            workspaces: Arc::new(PgUserWorkspaces::new(store, None)),
        })
    }
}

#[async_trait]
impl Users for PgUsers {
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
                Arc::new(PgUserWorkspaces::new(
                    self.store.clone(),
                    Some(user_id.to_string()),
                )),
            )
        }))
    }
}

#[cfg(all(test, feature = "postgres-tests"))]
mod postgres_tests {
    use testcontainers::runners::AsyncRunner;
    use testcontainers_modules::postgres::Postgres;

    use crate::persistent::test_support::contracts;

    use super::*;

    struct PgTestContext {
        users: PgUsers,
        _container: Option<testcontainers::ContainerAsync<Postgres>>,
    }

    async fn pg_test_context() -> PgTestContext {
        if let Ok(database_url) = std::env::var("TEST_DATABASE_URL") {
            return PgTestContext {
                users: PgUsers::connect(&database_url).await.unwrap(),
                _container: None,
            };
        }

        let container = Postgres::default().start().await.expect(
            "postgres-tests require Docker or TEST_DATABASE_URL pointing at a disposable PostgreSQL database",
        );
        let host = container.get_host().await.unwrap();
        let port = container.get_host_port_ipv4(5432).await.unwrap();
        let database_url = format!("postgres://postgres:postgres@{host}:{port}/postgres");

        PgTestContext {
            users: PgUsers::connect(&database_url).await.unwrap(),
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
}
