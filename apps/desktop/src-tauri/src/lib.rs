#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {name}! This response came from Rust.")
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
