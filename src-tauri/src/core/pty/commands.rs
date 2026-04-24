use crate::core::pty::manager::ReaderState;
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
    // Grab the shared state handle so the reader thread can buffer early
    // output (before the frontend subscribes) and flip to direct emission
    // once `pty_start_stream` is called.
    let state_handle = mgr.state_handle(&id)?;
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
                    let chunk = &buf[..n];
                    let should_emit = {
                        let mut state = match state_handle.lock() {
                            Ok(s) => s,
                            Err(poisoned) => poisoned.into_inner(),
                        };
                        match &mut *state {
                            ReaderState::Buffering(b) => {
                                // Cap the pre-subscribe buffer so a runaway shell
                                // (or a frontend that never calls start_stream)
                                // can't grow memory unbounded.
                                const MAX_BUFFER: usize = 256 * 1024;
                                if b.len() + chunk.len() > MAX_BUFFER {
                                    let keep = MAX_BUFFER.saturating_sub(chunk.len());
                                    let drop_n = b.len().saturating_sub(keep);
                                    b.drain(..drop_n);
                                }
                                b.extend_from_slice(chunk);
                                false
                            }
                            ReaderState::Streaming => true,
                        }
                    };
                    if should_emit {
                        let data = String::from_utf8_lossy(chunk).to_string();
                        let _ = app_clone.emit(&format!("pty-output:{}", id_clone), data);
                    }
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

/// Drain the pre-subscribe buffer for a session and switch it to streaming.
/// The frontend should call this AFTER attaching its `pty-output:${id}`
/// listener so the initial shell prompt isn't lost.
#[tauri::command]
pub async fn pty_start_stream(app: AppHandle, id: String) -> Result<String, String> {
    let state = app.state::<AppState>();
    let mgr = state.pty.lock().await;
    mgr.start_stream(&id)
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
