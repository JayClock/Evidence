use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::domain::{
    LogicalRelationship, LogicalRelationshipDescription, Ref, ServerError, Workspace,
};

use super::{
    error::ApiError,
    links::{workspace_logical_relationships_href, Link},
    model::{logical_relationship_model, LogicalRelationshipModel},
    AppState,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PageQuery {
    page: Option<u32>,
    page_size: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateLogicalRelationshipInput {
    source: Ref<String>,
    target: Ref<String>,
    label: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateLogicalRelationshipInput {
    source: Option<Ref<String>>,
    target: Option<Ref<String>>,
    label: Option<String>,
}

async fn load_workspace(state: &AppState, workspace_id: &str) -> Result<Workspace, ServerError> {
    state
        .users
        .workspaces()
        .find_by_identity(workspace_id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("workspace {workspace_id} not found")))
}

fn logical_relationship_description(
    workspace_id: &str,
    input: CreateLogicalRelationshipInput,
) -> Result<LogicalRelationshipDescription, ApiError> {
    Ok(LogicalRelationshipDescription {
        workspace: Ref::new(workspace_id.to_string()),
        source: input.source,
        target: input.target,
        label: input.label,
    })
}

async fn list_logical_relationships(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
    Query(query): Query<PageQuery>,
) -> Result<Json<Value>, ApiError> {
    let workspace = load_workspace(&state, &workspace_id).await?;
    let page = query.page.unwrap_or(1);
    let page_size = query.page_size.unwrap_or(50).min(100);
    let (relationships, total) = workspace
        .logical_relationships_wide()
        .list(page, page_size)
        .await?;
    Ok(Json(logical_relationship_collection_resource(
        &workspace_id,
        &relationships,
        page,
        page_size,
        total,
    )))
}

async fn create_logical_relationship(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
    Json(input): Json<CreateLogicalRelationshipInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let workspace = load_workspace(&state, &workspace_id).await?;
    let relationship = workspace
        .logical_relationships_wide()
        .add(logical_relationship_description(&workspace_id, input)?)
        .await?;
    Ok((
        StatusCode::CREATED,
        Json(logical_relationship_resource(&relationship)),
    ))
}

async fn get_logical_relationship(
    State(state): State<AppState>,
    Path((workspace_id, relationship_id)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    let workspace = load_workspace(&state, &workspace_id).await?;
    let relationship = workspace
        .logical_relationships()
        .find_by_identity(&relationship_id)
        .await?
        .ok_or_else(|| {
            ServerError::NotFound(format!("logical relationship {relationship_id} not found"))
        })?;
    Ok(Json(logical_relationship_resource(&relationship)))
}

async fn update_logical_relationship(
    State(state): State<AppState>,
    Path((workspace_id, relationship_id)): Path<(String, String)>,
    Json(input): Json<UpdateLogicalRelationshipInput>,
) -> Result<Json<Value>, ApiError> {
    let workspace = load_workspace(&state, &workspace_id).await?;
    let existing = workspace
        .logical_relationships()
        .find_by_identity(&relationship_id)
        .await?
        .ok_or_else(|| {
            ServerError::NotFound(format!("logical relationship {relationship_id} not found"))
        })?;
    let current = existing.description();
    let relationship = workspace
        .logical_relationships_wide()
        .update(
            &relationship_id,
            LogicalRelationshipDescription {
                workspace: current.workspace.clone(),
                source: input.source.unwrap_or_else(|| current.source.clone()),
                target: input.target.unwrap_or_else(|| current.target.clone()),
                label: input.label.or_else(|| current.label.clone()),
            },
        )
        .await?;
    Ok(Json(logical_relationship_resource(&relationship)))
}

async fn delete_logical_relationship(
    State(state): State<AppState>,
    Path((workspace_id, relationship_id)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    let workspace = load_workspace(&state, &workspace_id).await?;
    workspace
        .logical_relationships_wide()
        .delete(&relationship_id)
        .await?;
    Ok(Json(json!({ "deleted": true })))
}

pub(super) fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/api/workspaces/{workspaceId}/logical-relationships",
            get(list_logical_relationships).post(create_logical_relationship),
        )
        .route(
            "/api/workspaces/{workspaceId}/logical-relationships/{relationshipId}",
            get(get_logical_relationship)
                .put(update_logical_relationship)
                .delete(delete_logical_relationship),
        )
}

fn logical_relationship_resource(relationship: &LogicalRelationship) -> Value {
    let model: LogicalRelationshipModel = logical_relationship_model(relationship);
    serde_json::to_value(model).expect("logical relationship model should serialize")
}

fn logical_relationship_collection_resource(
    workspace_id: &str,
    relationships: &[LogicalRelationship],
    page: u32,
    page_size: u32,
    total: u64,
) -> Value {
    let total_pages = if total == 0 {
        0
    } else {
        total.div_ceil(page_size as u64)
    };
    let mut links = serde_json::Map::new();
    links.insert(
        "self".to_string(),
        json!(Link::new(format!(
            "{}?page={page}&pageSize={page_size}",
            workspace_logical_relationships_href(workspace_id)
        ))),
    );
    links.insert(
        "workspace".to_string(),
        json!(Link::new(format!("/api/workspaces/{workspace_id}"))),
    );
    if page > 1 {
        links.insert(
            "prev".to_string(),
            json!(Link::new(format!(
                "{}?page={}&pageSize={page_size}",
                workspace_logical_relationships_href(workspace_id),
                page - 1
            ))),
        );
    }
    if (page as u64) < total_pages {
        links.insert(
            "next".to_string(),
            json!(Link::new(format!(
                "{}?page={}&pageSize={page_size}",
                workspace_logical_relationships_href(workspace_id),
                page + 1
            ))),
        );
    }

    json!({
        "_links": links,
        "_embedded": {
            "logicalRelationships": relationships.iter().map(logical_relationship_resource).collect::<Vec<_>>(),
        },
        "page": {
            "number": page,
            "size": page_size,
            "totalElements": total,
            "totalPages": total_pages,
        },
    })
}
