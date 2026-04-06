use crate::core::sidecar::binary::find_openacp_binary;

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
pub async fn invoke_cli(args: Vec<String>, _app: tauri::AppHandle) -> Result<String, String> {
    let (bin, extra_path) =
        find_openacp_binary().ok_or_else(|| "Could not find openacp binary".to_string())?;
    let mut cmd = tokio::process::Command::new(&bin);
    cmd.args(&args);
    if let Some(ref extra) = extra_path {
        let sep = if cfg!(windows) { ";" } else { ":" };
        let current = std::env::var("PATH").unwrap_or_default();
        cmd.env("PATH", format!("{extra}{sep}{current}"));
    }
    let output = cmd.output().await.map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(if stderr.is_empty() {
            format!("CLI exited with status: {}", output.status)
        } else {
            stderr
        })
    }
}
