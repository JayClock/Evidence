use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::domain::{
    normalize_sub_type, EntityDefinition, LogicalEntity, LogicalEntityDescription,
    LogicalEntityType, Ref, ServerError, Workspace,
};

use super::{
    error::ApiError,
    links::{workspace_logical_entities_href, Link},
    model::{logical_entity_model, LogicalEntityModel},
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
struct CreateLogicalEntityInput {
    #[serde(rename = "type")]
    entity_type: LogicalEntityType,
    sub_type: Option<String>,
    name: String,
    label: Option<String>,
    definition: Option<EntityDefinition>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateLogicalEntityInput {
    #[serde(rename = "type")]
    entity_type: Option<LogicalEntityType>,
    sub_type: Option<String>,
    name: Option<String>,
    label: Option<String>,
    definition: Option<EntityDefinition>,
}

async fn load_workspace(state: &AppState, workspace_id: &str) -> Result<Workspace, ServerError> {
    state
        .users
        .workspaces()
        .find_by_identity(workspace_id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("workspace {workspace_id} not found")))
}

fn logical_entity_description(
    workspace_id: &str,
    input: CreateLogicalEntityInput,
) -> Result<LogicalEntityDescription, ApiError> {
    let sub_type = normalize_sub_type(&input.entity_type, input.sub_type)?;
    Ok(LogicalEntityDescription {
        workspace: Ref::new(workspace_id.to_string()),
        entity_type: input.entity_type,
        sub_type,
        name: input.name,
        label: input.label,
        definition: input.definition,
        created_at: String::new(),
        updated_at: String::new(),
    })
}

async fn list_logical_entities(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
    Query(query): Query<PageQuery>,
) -> Result<Json<Value>, ApiError> {
    let workspace = load_workspace(&state, &workspace_id).await?;
    let page = query.page.unwrap_or(1);
    let page_size = query.page_size.unwrap_or(50).min(100);
    let (entities, total) = workspace
        .logical_entities_wide()
        .list(page, page_size)
        .await?;
    Ok(Json(logical_entity_collection_resource(
        &workspace_id,
        &entities,
        page,
        page_size,
        total,
    )))
}

async fn create_logical_entity(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
    Json(input): Json<CreateLogicalEntityInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let workspace = load_workspace(&state, &workspace_id).await?;
    let entity = workspace
        .logical_entities_wide()
        .add(logical_entity_description(&workspace_id, input)?)
        .await?;
    Ok((StatusCode::CREATED, Json(logical_entity_resource(&entity))))
}

async fn get_logical_entity(
    State(state): State<AppState>,
    Path((workspace_id, entity_id)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    let workspace = load_workspace(&state, &workspace_id).await?;
    let entity = workspace
        .logical_entities()
        .find_by_identity(&entity_id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("logical entity {entity_id} not found")))?;
    Ok(Json(logical_entity_resource(&entity)))
}

async fn update_logical_entity(
    State(state): State<AppState>,
    Path((workspace_id, entity_id)): Path<(String, String)>,
    Json(input): Json<UpdateLogicalEntityInput>,
) -> Result<Json<Value>, ApiError> {
    let workspace = load_workspace(&state, &workspace_id).await?;
    let existing = workspace
        .logical_entities()
        .find_by_identity(&entity_id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("logical entity {entity_id} not found")))?;
    let current = existing.description();
    let entity_type = input
        .entity_type
        .unwrap_or_else(|| current.entity_type.clone());
    let sub_type = match input.sub_type {
        Some(value) => normalize_sub_type(&entity_type, Some(value))?,
        None => current.sub_type.clone(),
    };
    let entity = workspace
        .logical_entities_wide()
        .update(
            &entity_id,
            LogicalEntityDescription {
                workspace: current.workspace.clone(),
                entity_type,
                sub_type,
                name: input.name.unwrap_or_else(|| current.name.clone()),
                label: input.label.or_else(|| current.label.clone()),
                definition: input.definition.or_else(|| current.definition.clone()),
                created_at: current.created_at.clone(),
                updated_at: current.updated_at.clone(),
            },
        )
        .await?;
    Ok(Json(logical_entity_resource(&entity)))
}

async fn delete_logical_entity(
    State(state): State<AppState>,
    Path((workspace_id, entity_id)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    let workspace = load_workspace(&state, &workspace_id).await?;
    workspace.logical_entities_wide().delete(&entity_id).await?;
    Ok(Json(json!({ "deleted": true })))
}

pub(super) fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/api/workspaces/{workspaceId}/logical-entities",
            get(list_logical_entities).post(create_logical_entity),
        )
        .route(
            "/api/workspaces/{workspaceId}/logical-entities/{entityId}",
            get(get_logical_entity)
                .put(update_logical_entity)
                .delete(delete_logical_entity),
        )
}

fn logical_entity_resource(entity: &LogicalEntity) -> Value {
    let model: LogicalEntityModel = logical_entity_model(entity);
    serde_json::to_value(model).expect("logical entity model should serialize")
}

fn logical_entity_collection_resource(
    workspace_id: &str,
    entities: &[LogicalEntity],
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
            workspace_logical_entities_href(workspace_id)
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
                workspace_logical_entities_href(workspace_id),
                page - 1
            ))),
        );
    }
    if (page as u64) < total_pages {
        links.insert(
            "next".to_string(),
            json!(Link::new(format!(
                "{}?page={}&pageSize={page_size}",
                workspace_logical_entities_href(workspace_id),
                page + 1
            ))),
        );
    }

    json!({
        "_links": links,
        "_embedded": {
            "logicalEntities": entities.iter().map(logical_entity_resource).collect::<Vec<_>>(),
        },
        "page": {
            "number": page,
            "size": page_size,
            "totalElements": total,
            "totalPages": total_pages,
        },
    })
}
