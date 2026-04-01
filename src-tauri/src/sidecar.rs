use crate::ServerInfo;
use std::path::PathBuf;
use std::time::Duration;

/// Manages connection to the OpenACP server.
///
/// Unlike OpenCode which always spawns its own sidecar, OpenACP server
/// is typically already running (started via `openacp start`). The desktop
/// app reads connection info from well-known paths:
///   - ~/.openacp/api.port   — the port number
///   - ~/.openacp/api-secret — the bearer token
///
/// If the server isn't running, we can optionally spawn it.
pub struct SidecarManager {
    server_info: Option<ServerInfo>,
    child: Option<tokio::process::Child>,
}

impl SidecarManager {
    pub fn new() -> Self {
        Self {
            server_info: None,
            child: None,
        }
    }

    pub fn server_info(&self) -> Option<ServerInfo> {
        self.server_info.clone()
    }

    /// Try to detect an already-running OpenACP server by reading
    /// ~/.openacp/api.port and ~/.openacp/api-secret
    pub async fn detect_running(&mut self) -> bool {
        let Some(info) = read_server_files() else {
            return false;
        };

        // Health check
        if check_health(&info.url, &info.token).await {
            self.server_info = Some(info);
            return true;
        }

        false
    }

    /// Start the OpenACP server as a subprocess
    pub async fn start(&mut self) -> Result<(), String> {
        // First check if already running
        if self.detect_running().await {
            return Ok(());
        }

        // Find openacp binary
        let bin = find_openacp_binary().ok_or("Could not find openacp binary")?;

        tracing::info!(?bin, "Starting OpenACP server");

        let child = tokio::process::Command::new(&bin)
            .arg("start")
            .arg("--headless")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start OpenACP: {e}"))?;

        self.child = Some(child);

        // Wait for server to become ready
        for _ in 0..60 {
            tokio::time::sleep(Duration::from_millis(500)).await;
            if self.detect_running().await {
                tracing::info!("OpenACP server is ready");
                return Ok(());
            }
        }

        Err("OpenACP server did not become ready within 30s".to_string())
    }

    /// Stop the sidecar if we spawned it
    pub async fn stop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill().await;
        }
        self.server_info = None;
    }
}

fn openacp_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".openacp"))
}

fn read_server_files() -> Option<ServerInfo> {
    let dir = openacp_dir()?;

    let port_str = std::fs::read_to_string(dir.join("api.port")).ok()?;
    let port: u16 = port_str.trim().parse().ok()?;

    let token = std::fs::read_to_string(dir.join("api-secret")).ok()?;
    let token = token.trim().to_string();

    if token.is_empty() {
        return None;
    }

    Some(ServerInfo {
        url: format!("http://127.0.0.1:{port}"),
        token,
    })
}

async fn check_health(url: &str, token: &str) -> bool {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .no_proxy()
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };

    let health_url = format!("{url}/api/health");
    client
        .get(&health_url)
        .bearer_auth(token)
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

fn find_openacp_binary() -> Option<PathBuf> {
    // Check PATH via `which`
    if let Ok(output) = std::process::Command::new("which")
        .arg("openacp")
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(PathBuf::from(path));
            }
        }
    }

    // Check npm global install location
    if let Some(home) = dirs::home_dir() {
        let npm_global = home.join(".npm-global/bin/openacp");
        if npm_global.exists() {
            return Some(npm_global);
        }
    }

    None
}
