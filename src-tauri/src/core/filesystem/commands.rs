use crate::core::sidecar::binary::find_openacp_binary;
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
