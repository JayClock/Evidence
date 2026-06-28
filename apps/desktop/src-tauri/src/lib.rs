use std::{error::Error, sync::Arc};

use evidence_server::{api, infrastructure::PiRpcDomainArchitect, persistent::DbUsers};
use tauri::Manager;

#[derive(Clone)]
struct ApiState {
    base_url: String,
}

#[tauri::command]
fn get_api_base_url(state: tauri::State<'_, ApiState>) -> String {
    state.base_url.clone()
}

async fn start_embedded_api(app_handle: tauri::AppHandle) -> Result<ApiState, Box<dyn Error>> {
    let app_data_dir = app_handle.path().app_data_dir()?;
    std::fs::create_dir_all(&app_data_dir)?;

    let database_path = app_data_dir.join("evidence.sqlite");
    let database_url = format!("sqlite://{}?mode=rwc", database_path.display());
    let users = DbUsers::connect(&database_url).await?;
    let router = api::app(Arc::new(users), Arc::new(PiRpcDomainArchitect::default()));

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let addr = listener.local_addr()?;
    let base_url = format!("http://{addr}/api");

    tauri::async_runtime::spawn(async move {
        if let Err(error) = axum::serve(listener, router).await {
            eprintln!("embedded Evidence API failed: {error}");
        }
    });

    Ok(ApiState { base_url })
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let api_state =
                tauri::async_runtime::block_on(start_embedded_api(app.handle().clone()))?;
            app.manage(api_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_api_base_url])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
