use axum::{
    extract::{Path, State},
    routing::get,
    Json, Router,
};

use super::{
    error::ApiError,
    loaders::find_user,
    model::{user_model, UserModel},
    AppState,
};

async fn get_user(
    State(state): State<AppState>,
    Path(user_id): Path<String>,
) -> Result<Json<UserModel>, ApiError> {
    let user = find_user(&state, &user_id).await?;
    Ok(Json(user_model(&user)))
}

pub(super) fn routes() -> Router<AppState> {
    Router::new().route("/api/users/{userId}", get(get_user))
}
