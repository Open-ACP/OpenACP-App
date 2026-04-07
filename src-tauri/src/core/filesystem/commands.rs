use crate::core::sidecar::binary::{find_openacp_binary, prepend_path};

/// Read the current git branch from a workspace directory by parsing .git/HEAD.
#[tauri::command]
pub fn get_git_branch(directory: String) -> Option<String> {
    let git_head = std::path::Path::new(&directory).join(".git/HEAD");
    let content = std::fs::read_to_string(git_head).ok()?;
    let trimmed = content.trim();
    if let Some(branch) = trimmed.strip_prefix("ref: refs/heads/") {
        Some(branch.to_string())
    } else {
        // Detached HEAD — return short hash
        Some(trimmed.chars().take(7).collect())
    }
}

/// List local git branches from a workspace directory by reading .git/refs/heads/.
#[tauri::command]
pub fn get_git_branches(directory: String) -> Vec<String> {
    let refs_dir = std::path::Path::new(&directory).join(".git/refs/heads");
    let mut branches = Vec::new();
    collect_branches(&refs_dir, "", &mut branches);
    branches.sort();
    branches
}

fn collect_branches(dir: &std::path::Path, prefix: &str, out: &mut Vec<String>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let full = if prefix.is_empty() { name.clone() } else { format!("{prefix}/{name}") };
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            collect_branches(&entry.path(), &full, out);
        } else {
            out.push(full);
        }
    }
}

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
        cmd.env("PATH", prepend_path(extra));
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
