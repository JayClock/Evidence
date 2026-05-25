use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, collections::HashMap};

use crate::domain::{ServerError, WorkspaceDescription};

use super::{
    error::ApiError,
    links::{user_href, user_workspaces_page_href, Link},
    loaders::{find_user, find_workspace},
    model::{workspace_model, WorkspaceModel},
    pagination::{add_page_links, PageModel, PageQuery},
    AppState,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListWorkspacesQuery {
    page: Option<u32>,
    page_size: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceInput {
    title: String,
    description: Option<String>,
    status: Option<String>,
    metadata: Option<HashMap<String, String>>,
}

impl WorkspaceInput {
    fn into_description(self) -> WorkspaceDescription {
        WorkspaceDescription {
            title: self.title,
            description: self.description,
            status: self.status.unwrap_or_else(|| "active".to_string()),
            metadata: self.metadata.unwrap_or_default(),
            created_at: String::new(),
            updated_at: String::new(),
        }
    }
}

#[derive(Serialize)]
struct WorkspaceCollectionEmbedded {
    workspaces: Vec<WorkspaceModel>,
}

#[derive(Serialize)]
struct WorkspaceCollectionModel {
    #[serde(rename = "_links")]
    links: BTreeMap<String, Link>,
    #[serde(rename = "_embedded")]
    embedded: WorkspaceCollectionEmbedded,
    page: PageModel,
}

async fn list_workspaces(
    State(state): State<AppState>,
    Path(user_id): Path<String>,
    Query(query): Query<ListWorkspacesQuery>,
) -> Result<Json<WorkspaceCollectionModel>, ApiError> {
    let user = find_user(&state, &user_id).await?;
    let page = query.page.unwrap_or(1);
    let page_size = query.page_size.unwrap_or(20).min(100);
    if page == 0 {
        return Err(ServerError::Validation("page must be greater than 0".to_string()).into());
    }
    if page_size == 0 {
        return Err(ServerError::Validation("pageSize must be greater than 0".to_string()).into());
    }

    let (workspaces, total) = user.workspaces().list(page, page_size, None).await?;
    let page_query = PageQuery {
        page,
        page_size,
        total_elements: total,
    };
    let mut links = BTreeMap::from([
        (
            "self".to_string(),
            Link::new(user_workspaces_page_href(&user_id, page, page_size)),
        ),
        ("user".to_string(), Link::new(user_href(&user_id))),
    ]);
    add_page_links(&mut links, page_query, |page| {
        user_workspaces_page_href(&user_id, page, page_size)
    });

    Ok(Json(WorkspaceCollectionModel {
        links,
        embedded: WorkspaceCollectionEmbedded {
            workspaces: workspaces
                .iter()
                .map(|workspace| workspace_model(&user_id, workspace))
                .collect(),
        },
        page: PageModel::from(page_query),
    }))
}

async fn create_workspace(
    State(state): State<AppState>,
    Path(user_id): Path<String>,
    Json(input): Json<WorkspaceInput>,
) -> Result<(StatusCode, Json<WorkspaceModel>), ApiError> {
    let user = find_user(&state, &user_id).await?;
    let workspace = user.workspaces().create(input.into_description()).await?;
    Ok((
        StatusCode::CREATED,
        Json(workspace_model(&user_id, &workspace)),
    ))
}

async fn get_workspace(
    State(state): State<AppState>,
    Path((user_id, workspace_id)): Path<(String, String)>,
) -> Result<Json<WorkspaceModel>, ApiError> {
    let workspace = find_workspace(&state, &user_id, &workspace_id).await?;
    Ok(Json(workspace_model(&user_id, &workspace)))
}

async fn update_workspace(
    State(state): State<AppState>,
    Path((user_id, workspace_id)): Path<(String, String)>,
    Json(input): Json<WorkspaceInput>,
) -> Result<Json<WorkspaceModel>, ApiError> {
    let user = find_user(&state, &user_id).await?;
    let workspace = user
        .workspaces()
        .update(&workspace_id, input.into_description())
        .await?;
    Ok(Json(workspace_model(&user_id, &workspace)))
}

async fn delete_workspace(
    State(state): State<AppState>,
    Path((user_id, workspace_id)): Path<(String, String)>,
) -> Result<StatusCode, ApiError> {
    let user = find_user(&state, &user_id).await?;
    user.workspaces().delete(&workspace_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub(super) fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/api/users/{userId}/workspaces",
            get(list_workspaces).post(create_workspace),
        )
        .route(
            "/api/users/{userId}/workspaces/{workspaceId}",
            get(get_workspace)
                .put(update_workspace)
                .delete(delete_workspace),
        )
}
