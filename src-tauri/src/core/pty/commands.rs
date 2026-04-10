use crate::state::AppState;
use tauri::{AppHandle, Emitter, Manager};

/// Create a new PTY session. Returns the session ID.
#[tauri::command]
pub async fn pty_create(
    app: AppHandle,
    cwd: String,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let state = app.state::<AppState>();
    let mut mgr = state.pty.lock().await;

    let id = mgr.create(&cwd, cols, rows)?;

    // Take reader and spawn a background task to stream output
    let reader = mgr.take_reader(&id)?;
    let app_clone = app.clone();
    let id_clone = id.clone();

    std::thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    // PTY closed — notify frontend
                    let _ = app_clone.emit(&format!("pty-exit:{}", id_clone), ());
                    break;
                }
                Ok(n) => {
                    // Send raw bytes as string (terminal data is UTF-8 compatible with ANSI)
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit(&format!("pty-output:{}", id_clone), data);
                }
                Err(e) => {
                    tracing::error!("PTY read error for {}: {}", id_clone, e);
                    let _ = app_clone.emit(&format!("pty-exit:{}", id_clone), ());
                    break;
                }
            }
        }
    });

    Ok(id)
}

/// Write user input to a PTY session.
#[tauri::command]
pub async fn pty_write(app: AppHandle, id: String, data: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut mgr = state.pty.lock().await;
    mgr.write(&id, &data)
}

/// Resize a PTY session.
#[tauri::command]
pub async fn pty_resize(
    app: AppHandle,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut mgr = state.pty.lock().await;
    mgr.resize(&id, cols, rows)
}

/// Close a PTY session.
#[tauri::command]
pub async fn pty_close(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut mgr = state.pty.lock().await;
    mgr.close(&id)
}

use std::io::Read;
