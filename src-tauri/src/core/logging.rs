use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

const MAX_LOG_SIZE: u64 = 5 * 1024 * 1024; // 5 MB
const RECENT_BUFFER_SIZE: usize = 500;

static LOG_STATE: std::sync::OnceLock<Mutex<LogState>> = std::sync::OnceLock::new();

struct LogState {
    log_path: PathBuf,
    recent: Vec<String>,
}

fn log_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".openacp").join("logs"))
}

/// Initialize the file logger. Call once at startup.
pub fn init() {
    let Some(dir) = log_dir() else { return };
    let _ = fs::create_dir_all(&dir);
    let log_path = dir.join("desktop.log");

    LOG_STATE.get_or_init(|| {
        Mutex::new(LogState {
            log_path,
            recent: Vec::with_capacity(RECENT_BUFFER_SIZE),
        })
    });
}

/// Write a log line to file + recent buffer. Handles rotation.
pub fn write_line(level: &str, source: &str, message: &str) {
    let Some(state) = LOG_STATE.get() else { return };
    let Ok(mut state) = state.lock() else { return };

    let timestamp = chrono_lite_now();
    let line = format!("[{timestamp}] [{level}] [{source}] {message}");

    // Push to recent buffer (ring)
    if state.recent.len() >= RECENT_BUFFER_SIZE {
        state.recent.remove(0);
    }
    state.recent.push(line.clone());

    // Write to file with rotation check
    if let Ok(meta) = fs::metadata(&state.log_path) {
        if meta.len() > MAX_LOG_SIZE {
            let old = state.log_path.with_extension("log.old");
            let _ = fs::rename(&state.log_path, &old);
        }
    }
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&state.log_path)
    {
        let _ = writeln!(file, "{line}");
    }
}

/// Get the last N lines from the recent buffer.
pub fn get_recent(count: usize) -> Vec<String> {
    let Some(state) = LOG_STATE.get() else { return vec![] };
    let Ok(state) = state.lock() else { return vec![] };
    let start = state.recent.len().saturating_sub(count);
    state.recent[start..].to_vec()
}

/// Get the log file path.
pub fn log_file_path() -> Option<String> {
    log_dir().map(|d| d.join("desktop.log").to_string_lossy().to_string())
}

/// Simple timestamp without chrono crate dependency.
fn chrono_lite_now() -> String {
    use std::time::SystemTime;
    let dur = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();
    // UTC date-time from epoch seconds (good enough for log timestamps)
    let days = secs / 86400;
    let time_secs = secs % 86400;
    let hours = time_secs / 3600;
    let minutes = (time_secs % 3600) / 60;
    let seconds = time_secs % 60;

    // Approximate date from days since epoch (simplified, no leap second handling)
    let (year, month, day) = days_to_date(days);
    format!("{year:04}-{month:02}-{day:02}T{hours:02}:{minutes:02}:{seconds:02}Z")
}

fn days_to_date(days: u64) -> (u64, u64, u64) {
    // Algorithm from http://howardhinnant.github.io/date_algorithms.html
    let z = days + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

// -- Tauri commands --

#[tauri::command]
pub fn write_fe_log(level: String, message: String) {
    write_line(&level, "fe", &message);
}

#[tauri::command]
pub fn get_recent_logs(count: Option<usize>) -> Vec<String> {
    get_recent(count.unwrap_or(100))
}

#[tauri::command]
pub fn get_log_file_path() -> Option<String> {
    log_file_path()
}
