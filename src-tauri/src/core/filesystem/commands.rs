use crate::core::sidecar::binary::{find_openacp_binary, prepend_path};
use std::path::Path;

// ── File Tree Commands ──────────────────────────────────────────────────────

#[derive(Clone, serde::Serialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub node_type: String, // "file" | "directory"
}

#[derive(Clone, serde::Serialize)]
pub struct FileContent {
    pub content: String,
    pub language: String,
}

#[derive(Clone, serde::Serialize)]
pub struct FileChange {
    pub path: String,
    pub status: String, // "modified" | "added" | "deleted" | "untracked"
}

/// List one level of a directory, sorted: directories first, then files.
/// Skips hidden files (.) and common ignore patterns.
#[tauri::command]
pub fn read_directory(path: String) -> Result<Vec<FileNode>, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {path}"));
    }

    // Load .gitignore patterns
    let gitignore = load_gitignore(dir);

    let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    let mut dirs = Vec::new();
    let mut files = Vec::new();

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files and common noise
        if name.starts_with('.') || name == "node_modules" || name == "__pycache__" || name == "target" {
            continue;
        }

        let abs_path = entry.path().to_string_lossy().to_string();

        // Check gitignore
        if let Some(ref gi) = gitignore {
            let relative = entry.path().strip_prefix(workspace_root(dir)).unwrap_or(&entry.path()).to_path_buf();
            if gi.matched(&relative, entry.file_type().map(|t| t.is_dir()).unwrap_or(false)).is_ignore() {
                continue;
            }
        }

        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let node = FileNode {
            name,
            path: abs_path,
            node_type: if is_dir { "directory".into() } else { "file".into() },
        };

        if is_dir { dirs.push(node); } else { files.push(node); }
    }

    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    dirs.extend(files);
    Ok(dirs)
}

/// Read file content as string. Rejects binary or large files.
#[tauri::command]
pub fn read_file_content(path: String) -> Result<FileContent, String> {
    let p = Path::new(&path);
    if !p.is_file() {
        return Err(format!("Not a file: {path}"));
    }

    let metadata = std::fs::metadata(p).map_err(|e| e.to_string())?;
    if metadata.len() > 2 * 1024 * 1024 {
        return Err("File too large (>2MB)".into());
    }

    let content = std::fs::read_to_string(p).map_err(|_| "Binary or unreadable file".to_string())?;
    let language = language_from_ext(p.extension().and_then(|e| e.to_str()).unwrap_or(""));

    Ok(FileContent { content, language })
}

/// Read a file as base64 data URL for drag-drop attachments.
/// Supports images, PDFs, text, and code files up to 10 MB.
#[tauri::command]
pub fn read_file_base64(path: String) -> Result<DroppedFile, String> {
    use base64::{Engine, engine::general_purpose::STANDARD};

    let p = Path::new(&path);
    if !p.is_file() {
        return Err(format!("Not a file: {path}"));
    }

    let metadata = std::fs::metadata(p).map_err(|e| e.to_string())?;
    if metadata.len() > 10 * 1024 * 1024 {
        return Err("File too large (>10 MB)".into());
    }

    let file_name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = mime_from_ext(&ext);

    let bytes = std::fs::read(p).map_err(|e| e.to_string())?;
    let b64 = STANDARD.encode(&bytes);
    let data_url = format!("data:{};base64,{}", mime, b64);

    Ok(DroppedFile {
        file_name,
        mime_type: mime.to_string(),
        data_url,
        size: metadata.len(),
    })
}

#[derive(Clone, serde::Serialize)]
pub struct DroppedFile {
    #[serde(rename = "fileName")]
    pub file_name: String,
    #[serde(rename = "mimeType")]
    pub mime_type: String,
    #[serde(rename = "dataUrl")]
    pub data_url: String,
    pub size: u64,
}

fn mime_from_ext(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "json" => "application/json",
        "csv" => "text/csv",
        "xml" => "application/xml",
        "yaml" | "yml" => "text/yaml",
        "toml" => "text/plain",
        "md" => "text/markdown",
        "txt" | "log" => "text/plain",
        "html" | "htm" => "text/html",
        "css" => "text/css",
        "js" | "mjs" | "cjs" => "text/javascript",
        "ts" | "tsx" | "jsx" => "text/typescript",
        "rs" => "text/x-rust",
        "py" => "text/x-python",
        "go" => "text/x-go",
        "java" => "text/x-java",
        "c" | "h" => "text/x-c",
        "cpp" | "hpp" | "cc" => "text/x-c++",
        "swift" => "text/x-swift",
        "rb" => "text/x-ruby",
        "php" => "text/x-php",
        "sh" | "bash" | "zsh" => "text/x-shellscript",
        "sql" => "text/x-sql",
        _ => "application/octet-stream",
    }
}

/// Get git changes for a workspace directory.
#[tauri::command]
pub fn get_workspace_changes(path: String) -> Result<Vec<FileChange>, String> {
    let output = std::process::Command::new("git")
        .args(["status", "--porcelain", "-uall"])
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err("Not a git repository".into());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let changes: Vec<FileChange> = stdout
        .lines()
        .filter(|line| line.len() > 3)
        .map(|line| {
            let status_code = &line[..2];
            let file_path = line[3..].trim().to_string();
            let status = match status_code.trim() {
                "M" | "MM" => "modified",
                "A" | "AM" => "added",
                "D" => "deleted",
                "??" => "untracked",
                _ => "modified",
            };
            FileChange {
                path: file_path,
                status: status.into(),
            }
        })
        .collect();

    Ok(changes)
}

fn language_from_ext(ext: &str) -> String {
    match ext {
        "ts" | "tsx" => "typescript",
        "js" | "jsx" => "javascript",
        "rs" => "rust",
        "py" => "python",
        "css" => "css",
        "html" => "html",
        "json" => "json",
        "md" => "markdown",
        "yaml" | "yml" => "yaml",
        "toml" => "toml",
        "sh" | "bash" | "zsh" => "bash",
        "sql" => "sql",
        "go" => "go",
        "java" => "java",
        "c" | "h" => "c",
        "cpp" | "hpp" | "cc" => "cpp",
        "swift" => "swift",
        "rb" => "ruby",
        "php" => "php",
        "vue" => "vue",
        "svelte" => "svelte",
        _ => "text",
    }
    .into()
}

fn workspace_root(dir: &Path) -> &Path {
    // Walk up to find .git directory
    let mut current = dir;
    loop {
        if current.join(".git").exists() {
            return current;
        }
        match current.parent() {
            Some(parent) => current = parent,
            None => return dir,
        }
    }
}

fn load_gitignore(dir: &Path) -> Option<ignore::gitignore::Gitignore> {
    let root = workspace_root(dir);
    let gitignore_path = root.join(".gitignore");
    if gitignore_path.exists() {
        let (gi, _) = ignore::gitignore::Gitignore::new(&gitignore_path);
        Some(gi)
    } else {
        None
    }
}

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
pub fn remove_directory(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if p.exists() && p.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| e.to_string())?;
    }
    Ok(())
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
