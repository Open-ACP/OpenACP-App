use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex as StdMutex};
use tokio::sync::Mutex;

/// Output mode for a session's reader thread.
///
/// Newly-created sessions start in `Buffering`: the reader thread appends
/// chunks to the vec instead of emitting Tauri events. This prevents the
/// initial shell prompt from being lost to the race between `pty_create`
/// returning (which starts the reader) and the frontend wiring up its
/// `pty-output:${id}` listener.
///
/// The frontend flips the session to `Streaming` by calling
/// `pty_start_stream`, which atomically drains the accumulated buffer and
/// hands it back. Subsequent reads emit events directly.
pub enum ReaderState {
    Buffering(Vec<u8>),
    Streaming,
}

/// Represents a single PTY session
struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    _child: Box<dyn portable_pty::Child + Send + Sync>,
    state: Arc<StdMutex<ReaderState>>,
}

/// Manages multiple PTY sessions. Designed to be swappable with a server-based
/// backend in the future — all operations use string IDs and serializable types.
pub struct PtyManager {
    sessions: HashMap<String, PtySession>,
    counter: u64,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
            counter: 0,
        }
    }

    /// Spawn a new PTY shell process in the given directory.
    /// Returns the session ID.
    pub fn create(
        &mut self,
        cwd: &str,
        cols: u16,
        rows: u16,
    ) -> Result<String, String> {
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {e}"))?;

        let mut cmd = CommandBuilder::new_default_prog();
        cmd.cwd(cwd);
        // Set TERM for color support
        cmd.env("TERM", "xterm-256color");

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell: {e}"))?;

        // Drop slave — we only need the master side
        drop(pair.slave);

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get PTY writer: {e}"))?;

        self.counter += 1;
        let id = format!("pty_{}", self.counter);

        self.sessions.insert(
            id.clone(),
            PtySession {
                master: pair.master,
                writer,
                _child: child,
                state: Arc::new(StdMutex::new(ReaderState::Buffering(Vec::with_capacity(4096)))),
            },
        );

        Ok(id)
    }

    /// Get a reader for streaming PTY output.
    /// The reader is consumed — call this once per session and read in a spawned task.
    pub fn take_reader(&mut self, id: &str) -> Result<Box<dyn Read + Send>, String> {
        let session = self
            .sessions
            .get_mut(id)
            .ok_or_else(|| format!("PTY session not found: {id}"))?;

        session
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {e}"))
    }

    /// Clone the reader-state handle for a session. Used by the background
    /// reader thread to decide whether to buffer or emit each chunk.
    pub fn state_handle(&self, id: &str) -> Result<Arc<StdMutex<ReaderState>>, String> {
        let session = self
            .sessions
            .get(id)
            .ok_or_else(|| format!("PTY session not found: {id}"))?;
        Ok(session.state.clone())
    }

    /// Flip the session to streaming mode and return any bytes that were
    /// buffered before the frontend attached its listener. Safe to call
    /// multiple times — subsequent calls return an empty string.
    pub fn start_stream(&self, id: &str) -> Result<String, String> {
        let session = self
            .sessions
            .get(id)
            .ok_or_else(|| format!("PTY session not found: {id}"))?;
        let mut state = session
            .state
            .lock()
            .map_err(|e| format!("PTY state lock poisoned: {e}"))?;
        let prev = std::mem::replace(&mut *state, ReaderState::Streaming);
        match prev {
            ReaderState::Buffering(buf) => Ok(String::from_utf8_lossy(&buf).into_owned()),
            ReaderState::Streaming => Ok(String::new()),
        }
    }

    /// Write input data to the PTY (user keystrokes).
    pub fn write(&mut self, id: &str, data: &str) -> Result<(), String> {
        let session = self
            .sessions
            .get_mut(id)
            .ok_or_else(|| format!("PTY session not found: {id}"))?;

        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write to PTY: {e}"))?;

        session
            .writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY: {e}"))?;

        Ok(())
    }

    /// Resize the PTY terminal.
    pub fn resize(&mut self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let session = self
            .sessions
            .get_mut(id)
            .ok_or_else(|| format!("PTY session not found: {id}"))?;

        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize PTY: {e}"))?;

        Ok(())
    }

    /// Close and clean up a PTY session.
    pub fn close(&mut self, id: &str) -> Result<(), String> {
        self.sessions
            .remove(id)
            .ok_or_else(|| format!("PTY session not found: {id}"))?;
        // Dropping the session will close the master PTY and kill the child process
        Ok(())
    }

    /// Close all sessions (e.g., on app exit).
    pub fn close_all(&mut self) {
        self.sessions.clear();
    }
}
