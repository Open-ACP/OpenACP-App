use std::collections::HashMap;
use tauri::Manager;

// TODO: Replace with OS credential store (e.g., `keyring` crate) for production.
// Currently stores tokens as plaintext JSON in app data dir -- acceptable for MVP only.
static KEYCHAIN: std::sync::Mutex<Option<HashMap<String, String>>> = std::sync::Mutex::new(None);

#[tauri::command]
pub fn keychain_set(key: String, value: String, app: tauri::AppHandle) -> Result<(), String> {
    let mut lock = KEYCHAIN.lock().map_err(|e| e.to_string())?;
    let map = lock.get_or_insert_with(HashMap::new);
    map.insert(key, value);
    // Persist to app data dir
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let keychain_path = data_dir.join("keychain.json");
    let json = serde_json::to_string(map).map_err(|e| e.to_string())?;
    std::fs::write(&keychain_path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn keychain_get(key: String, app: tauri::AppHandle) -> Result<Option<String>, String> {
    let mut lock = KEYCHAIN.lock().map_err(|e| e.to_string())?;
    if lock.is_none() {
        // Load from disk on first access
        let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let keychain_path = data_dir.join("keychain.json");
        if keychain_path.exists() {
            let raw = std::fs::read_to_string(&keychain_path).map_err(|e| e.to_string())?;
            let map: HashMap<String, String> = serde_json::from_str(&raw).unwrap_or_default();
            *lock = Some(map);
        } else {
            *lock = Some(HashMap::new());
        }
    }
    Ok(lock.as_ref().and_then(|m| m.get(&key).cloned()))
}

#[tauri::command]
pub fn keychain_delete(key: String, app: tauri::AppHandle) -> Result<(), String> {
    let mut lock = KEYCHAIN.lock().map_err(|e| e.to_string())?;
    if let Some(map) = lock.as_mut() {
        map.remove(&key);
        let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let keychain_path = data_dir.join("keychain.json");
        let json = serde_json::to_string(map).map_err(|e| e.to_string())?;
        std::fs::write(&keychain_path, json).map_err(|e| e.to_string())?;
    }
    Ok(())
}
