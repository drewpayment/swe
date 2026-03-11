//! Tool activity implementations.
//!
//! Provides common tools available to agents: file I/O, git, HTTP, etc.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use super::{ActivityResult, SweActivity};

/// Result of a tool execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    /// Whether the tool succeeded
    pub success: bool,
    /// Output from the tool
    pub output: serde_json::Value,
    /// Error message if failed
    pub error: Option<String>,
}

/// Tool activity for common operations.
pub struct ToolActivity {
    /// Base workspace path
    workspace_root: PathBuf,
}

impl ToolActivity {
    /// Create a new tool activity.
    pub fn new(workspace_root: impl Into<PathBuf>) -> Self {
        Self {
            workspace_root: workspace_root.into(),
        }
    }

    /// Read a file.
    pub async fn file_read(&self, path: &str) -> ActivityResult<String> {
        let full_path = self.workspace_root.join(path);
        tokio::fs::read_to_string(&full_path)
            .await
            .map_err(|e| swe_core::Error::Io(e))
    }

    /// Write a file.
    pub async fn file_write(&self, path: &str, content: &str) -> ActivityResult<()> {
        let full_path = self.workspace_root.join(path);
        if let Some(parent) = full_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| swe_core::Error::Io(e))?;
        }
        tokio::fs::write(&full_path, content)
            .await
            .map_err(|e| swe_core::Error::Io(e))
    }

    /// List directory contents.
    pub async fn file_list(&self, path: &str) -> ActivityResult<Vec<String>> {
        let full_path = self.workspace_root.join(path);
        let mut entries = Vec::new();
        let mut dir = tokio::fs::read_dir(&full_path)
            .await
            .map_err(|e| swe_core::Error::Io(e))?;

        while let Some(entry) = dir.next_entry().await.map_err(|e| swe_core::Error::Io(e))? {
            if let Some(name) = entry.file_name().to_str() {
                entries.push(name.to_string());
            }
        }

        Ok(entries)
    }

    /// Execute a shell command.
    pub async fn shell_exec(&self, command: &str, args: &[&str]) -> ActivityResult<ToolResult> {
        let output = tokio::process::Command::new(command)
            .args(args)
            .current_dir(&self.workspace_root)
            .output()
            .await
            .map_err(|e| swe_core::Error::Io(e))?;

        let success = output.status.success();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        Ok(ToolResult {
            success,
            output: serde_json::json!({
                "stdout": stdout,
                "stderr": stderr,
                "exit_code": output.status.code(),
            }),
            error: if success { None } else { Some(stderr) },
        })
    }

    /// Git commit changes.
    pub async fn git_commit(&self, message: &str) -> ActivityResult<ToolResult> {
        // Add all changes
        self.shell_exec("git", &["add", "-A"]).await?;
        // Commit
        self.shell_exec("git", &["commit", "-m", message]).await
    }

    /// Git push changes.
    pub async fn git_push(&self, remote: &str, branch: &str) -> ActivityResult<ToolResult> {
        self.shell_exec("git", &["push", remote, branch]).await
    }

    /// Create a git branch.
    pub async fn git_branch(&self, name: &str) -> ActivityResult<ToolResult> {
        self.shell_exec("git", &["checkout", "-b", name]).await
    }

    /// Make an HTTP request.
    pub async fn http_request(
        &self,
        method: &str,
        url: &str,
        headers: Option<std::collections::HashMap<String, String>>,
        body: Option<&str>,
    ) -> ActivityResult<ToolResult> {
        let client = reqwest::Client::new();
        let mut req = match method.to_uppercase().as_str() {
            "GET" => client.get(url),
            "POST" => client.post(url),
            "PUT" => client.put(url),
            "DELETE" => client.delete(url),
            "PATCH" => client.patch(url),
            _ => return Err(swe_core::Error::Internal(format!("Unknown HTTP method: {}", method))),
        };

        if let Some(headers) = headers {
            for (key, value) in headers {
                req = req.header(&key, &value);
            }
        }

        if let Some(body) = body {
            req = req.body(body.to_string());
        }

        let response: reqwest::Response = req
            .send()
            .await
            .map_err(|e| swe_core::Error::Internal(format!("HTTP request failed: {}", e)))?;

        let status = response.status();
        let body: String = response
            .text()
            .await
            .map_err(|e| swe_core::Error::Internal(format!("Failed to read response: {}", e)))?;

        Ok(ToolResult {
            success: status.is_success(),
            output: serde_json::json!({
                "status": status.as_u16(),
                "body": body,
            }),
            error: if status.is_success() {
                None
            } else {
                Some(format!("HTTP {}", status))
            },
        })
    }

    /// Search the web (stub - would integrate with search API).
    pub async fn web_search(&self, query: &str) -> ActivityResult<ToolResult> {
        // Stub - would call a search API
        tracing::info!(%query, "Web search requested");
        Ok(ToolResult {
            success: true,
            output: serde_json::json!({
                "results": [],
                "query": query,
            }),
            error: None,
        })
    }
}

#[async_trait]
impl SweActivity for ToolActivity {
    fn name(&self) -> &'static str {
        "tool_exec"
    }
}
