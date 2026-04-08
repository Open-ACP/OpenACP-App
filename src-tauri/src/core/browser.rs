use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Url, WebviewUrl};
use tauri::webview::WebviewBuilder;

const BROWSER_LABEL: &str = "browser-panel";
const FLOAT_LABEL: &str = "browser-float";

#[tauri::command]
pub async fn browser_open(
    app: AppHandle,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    // Close any existing browser (docked or floating)
    close_all(&app);
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let window = app
        .get_window("main")
        .ok_or("main window not found")?;

    let parsed = url.parse::<Url>().map_err(|e| e.to_string())?;
    let builder = WebviewBuilder::new(BROWSER_LABEL, WebviewUrl::External(parsed));

    window
        .add_child(
            builder,
            LogicalPosition::new(x, y),
            LogicalSize::new(width, height),
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn browser_navigate(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = url.parse::<Url>().map_err(|e| e.to_string())?;
    // Try docked first, then floating
    if let Some(wv) = app.get_webview(BROWSER_LABEL) {
        return wv.navigate(parsed).map_err(|e| e.to_string());
    }
    if let Some(ww) = app.get_webview_window(FLOAT_LABEL) {
        return ww.navigate(parsed).map_err(|e| e.to_string());
    }
    Err("browser webview not found".into())
}

#[tauri::command]
pub async fn browser_eval(app: AppHandle, js: String) -> Result<(), String> {
    if let Some(wv) = app.get_webview(BROWSER_LABEL) {
        return wv.eval(&js).map_err(|e| e.to_string());
    }
    if let Some(ww) = app.get_webview_window(FLOAT_LABEL) {
        return ww.eval(&js).map_err(|e| e.to_string());
    }
    Err("browser webview not found".into())
}

#[tauri::command]
pub async fn browser_close(app: AppHandle) -> Result<(), String> {
    close_all(&app);
    Ok(())
}

#[tauri::command]
pub async fn browser_set_bounds(
    app: AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let webview = app
        .get_webview(BROWSER_LABEL)
        .ok_or("browser webview not found")?;
    webview
        .set_position(tauri::Position::Logical(LogicalPosition::new(x, y)))
        .map_err(|e| e.to_string())?;
    webview
        .set_size(tauri::Size::Logical(LogicalSize::new(width, height)))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn browser_show(app: AppHandle) -> Result<(), String> {
    if let Some(webview) = app.get_webview(BROWSER_LABEL) {
        webview.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_hide(app: AppHandle) -> Result<(), String> {
    if let Some(webview) = app.get_webview(BROWSER_LABEL) {
        webview.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Float: close docked webview, open a new WebviewWindow (OS-level PiP window)
#[tauri::command]
pub async fn browser_float(app: AppHandle, url: String) -> Result<(), String> {
    // Close docked webview
    if let Some(wv) = app.get_webview(BROWSER_LABEL) {
        let _ = wv.close();
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    // Close existing float window if any
    if let Some(ww) = app.get_webview_window(FLOAT_LABEL) {
        let _ = ww.close();
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }

    let parsed = url.parse::<Url>().map_err(|e| e.to_string())?;

    tauri::WebviewWindowBuilder::new(&app, FLOAT_LABEL, WebviewUrl::External(parsed))
        .title("OpenACP Browser")
        .inner_size(900.0, 700.0)
        .resizable(true)
        .always_on_top(true)
        .decorations(true)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Dock: close floating window, recreate as child webview in main window
#[tauri::command]
pub async fn browser_dock(
    app: AppHandle,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    // Close floating window
    if let Some(ww) = app.get_webview_window(FLOAT_LABEL) {
        let _ = ww.close();
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }

    let window = app
        .get_window("main")
        .ok_or("main window not found")?;

    let parsed = url.parse::<Url>().map_err(|e| e.to_string())?;
    let builder = WebviewBuilder::new(BROWSER_LABEL, WebviewUrl::External(parsed));

    window
        .add_child(
            builder,
            LogicalPosition::new(x, y),
            LogicalSize::new(width, height),
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

fn close_all(app: &AppHandle) {
    if let Some(wv) = app.get_webview(BROWSER_LABEL) {
        let _ = wv.close();
    }
    if let Some(ww) = app.get_webview_window(FLOAT_LABEL) {
        let _ = ww.close();
    }
}
