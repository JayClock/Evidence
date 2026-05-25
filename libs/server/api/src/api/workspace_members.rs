use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use crate::domain::{MemberDescription, Ref, ServerError};

use super::{
    error::ApiError,
    links::{workspace_href, workspace_members_href, Link},
    loaders::find_workspace,
    model::{member_model, MemberModel},
    AppState,
};

#[derive(Deserialize)]
struct RefInput {
    id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddMemberInput {
    user: RefInput,
    role: Option<String>,
}

#[derive(Serialize)]
struct MemberCollectionEmbedded {
    members: Vec<MemberModel>,
}

#[derive(Serialize)]
struct MemberCollectionModel {
    #[serde(rename = "_links")]
    links: BTreeMap<String, Link>,
    #[serde(rename = "_embedded")]
    embedded: MemberCollectionEmbedded,
    total: usize,
}

async fn list_workspace_members(
    State(state): State<AppState>,
    Path((user_id, workspace_id)): Path<(String, String)>,
) -> Result<Json<MemberCollectionModel>, ApiError> {
    let workspace = find_workspace(&state, &user_id, &workspace_id).await?;
    let total = workspace.members().size().await?;
    let members = workspace.members().find_all(0, total).await?;

    Ok(Json(MemberCollectionModel {
        links: BTreeMap::from([
            (
                "self".to_string(),
                Link::new(workspace_members_href(&user_id, &workspace_id)),
            ),
            (
                "workspace".to_string(),
                Link::new(workspace_href(&user_id, &workspace_id)),
            ),
        ]),
        embedded: MemberCollectionEmbedded {
            members: members
                .iter()
                .map(|member| member_model(&user_id, member))
                .collect(),
        },
        total,
    }))
}

async fn get_workspace_member(
    State(state): State<AppState>,
    Path((user_id, workspace_id, member_id)): Path<(String, String, String)>,
) -> Result<Json<MemberModel>, ApiError> {
    let workspace = find_workspace(&state, &user_id, &workspace_id).await?;
    let member = workspace
        .members()
        .find_by_identity(&member_id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("workspace member {member_id} not found")))?;
    Ok(Json(member_model(&user_id, &member)))
}

async fn add_workspace_member(
    State(state): State<AppState>,
    Path((user_id, workspace_id)): Path<(String, String)>,
    Json(input): Json<AddMemberInput>,
) -> Result<(StatusCode, Json<MemberModel>), ApiError> {
    let workspace = find_workspace(&state, &user_id, &workspace_id).await?;
    let member = workspace
        .members_wide()
        .add_member(MemberDescription {
            workspace: Ref::new(workspace_id),
            user: Ref::new(input.user.id),
            role: input.role.unwrap_or_else(|| "member".to_string()),
            created_at: String::new(),
            updated_at: String::new(),
        })
        .await?;
    Ok((StatusCode::CREATED, Json(member_model(&user_id, &member))))
}

pub(super) fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/api/users/{userId}/workspaces/{workspaceId}/members",
            get(list_workspace_members).post(add_workspace_member),
        )
        .route(
            "/api/users/{userId}/workspaces/{workspaceId}/members/{memberId}",
            get(get_workspace_member),
        )
}
