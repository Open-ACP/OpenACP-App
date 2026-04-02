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
            tracing::debug!("detect_running: api.port or api-secret not found");
            return false;
        };

        tracing::debug!(url = %info.url, "detect_running: health-checking");
        if check_health(&info.url, &info.token).await {
            tracing::info!(url = %info.url, "detect_running: server is up");
            self.server_info = Some(info);
            return true;
        }

        tracing::debug!(url = %info.url, "detect_running: health check failed");
        false
    }

    /// Start the OpenACP server as a subprocess
    pub async fn start(&mut self) -> Result<(), String> {
        tracing::info!("start_server: checking if already running");
        if self.detect_running().await {
            tracing::info!("start_server: server already running, skipping spawn");
            return Ok(());
        }

        let bin = find_openacp_binary().ok_or("Could not find openacp binary")?;
        tracing::info!(?bin, "start_server: spawning openacp start");

        let child = tokio::process::Command::new(&bin)
            .arg("start")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start OpenACP: {e}"))?;

        self.child = Some(child);

        for i in 0..60 {
            tokio::time::sleep(Duration::from_millis(500)).await;
            tracing::debug!("start_server: poll {}/60", i + 1);
            if self.detect_running().await {
                tracing::info!("start_server: server ready after {}ms", (i + 1) * 500);
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

    let port_path = dir.join("api.port");
    let secret_path = dir.join("api-secret");

    let port_str = match std::fs::read_to_string(&port_path) {
        Ok(s) => s,
        Err(e) => {
            tracing::debug!("read_server_files: cannot read {}: {e}", port_path.display());
            return None;
        }
    };
    let port: u16 = match port_str.trim().parse() {
        Ok(p) => p,
        Err(e) => {
            tracing::debug!("read_server_files: invalid port {:?}: {e}", port_str.trim());
            return None;
        }
    };

    let token = match std::fs::read_to_string(&secret_path) {
        Ok(s) => s.trim().to_string(),
        Err(e) => {
            tracing::debug!("read_server_files: cannot read {}: {e}", secret_path.display());
            return None;
        }
    };

    if token.is_empty() {
        tracing::debug!("read_server_files: api-secret is empty");
        return None;
    }

    tracing::debug!(port, "read_server_files: ok");
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
        Err(e) => {
            tracing::error!("check_health: failed to build reqwest client: {e}");
            return false;
        }
    };

    let health_url = format!("{url}/api/v1/system/health");
    match client.get(&health_url).send().await {
        Ok(r) => {
            let ok = r.status().is_success();
            tracing::debug!(status = %r.status(), health_url, "check_health: response");
            ok
        }
        Err(e) => {
            tracing::debug!(health_url, "check_health: request failed: {e}");
            false
        }
    }
}

pub fn find_openacp_binary_pub() -> Option<PathBuf> {
    find_openacp_binary()
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
