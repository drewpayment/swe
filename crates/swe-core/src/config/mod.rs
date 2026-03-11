//! Configuration types and parsing.
//!
//! SWE uses TOML configuration files for platform settings.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Main configuration for the SWE platform.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    /// Platform-wide settings
    #[serde(default)]
    pub platform: PlatformConfig,
    /// Temporal connection settings
    #[serde(default)]
    pub temporal: TemporalConfig,
    /// LLM provider settings
    #[serde(default)]
    pub llm: LlmConfig,
    /// Kubernetes settings
    #[serde(default)]
    pub kubernetes: KubernetesConfig,
    /// API server settings
    #[serde(default)]
    pub api: ApiConfig,
    /// Database settings
    #[serde(default)]
    pub database: DatabaseConfig,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            platform: PlatformConfig::default(),
            temporal: TemporalConfig::default(),
            llm: LlmConfig::default(),
            kubernetes: KubernetesConfig::default(),
            api: ApiConfig::default(),
            database: DatabaseConfig::default(),
        }
    }
}

impl Config {
    /// Load configuration from a TOML file.
    pub fn load(path: impl Into<PathBuf>) -> crate::Result<Self> {
        let path = path.into();
        let content = std::fs::read_to_string(&path).map_err(|e| {
            crate::Error::Config(format!("Failed to read config file {:?}: {}", path, e))
        })?;
        toml::from_str(&content)
            .map_err(|e| crate::Error::Config(format!("Failed to parse config: {}", e)))
    }

    /// Load configuration from the default location (~/.swe/config.toml).
    pub fn load_default() -> crate::Result<Self> {
        let home = dirs_path();
        let config_path = home.join("config.toml");
        if config_path.exists() {
            Self::load(config_path)
        } else {
            Ok(Self::default())
        }
    }

    /// Save configuration to a TOML file.
    pub fn save(&self, path: impl Into<PathBuf>) -> crate::Result<()> {
        let path = path.into();
        let content = toml::to_string_pretty(self)
            .map_err(|e| crate::Error::Config(format!("Failed to serialize config: {}", e)))?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                crate::Error::Config(format!("Failed to create config directory: {}", e))
            })?;
        }
        std::fs::write(&path, content)
            .map_err(|e| crate::Error::Config(format!("Failed to write config file: {}", e)))?;
        Ok(())
    }
}

/// Get the SWE home directory (~/.swe).
pub fn dirs_path() -> PathBuf {
    dirs::home_dir()
        .expect("Could not find home directory")
        .join(".swe")
}

/// Platform-wide settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformConfig {
    /// Name of this SWE instance
    pub name: String,
    /// Log level (trace, debug, info, warn, error)
    pub log_level: String,
    /// Enable debug mode
    pub debug: bool,
}

impl Default for PlatformConfig {
    fn default() -> Self {
        Self {
            name: "swe".to_string(),
            log_level: "info".to_string(),
            debug: false,
        }
    }
}

/// Temporal connection settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemporalConfig {
    /// Temporal server address
    pub address: String,
    /// Temporal namespace
    pub namespace: String,
    /// Task queue name
    pub task_queue: String,
}

impl Default for TemporalConfig {
    fn default() -> Self {
        Self {
            address: "http://localhost:7233".to_string(),
            namespace: "default".to_string(),
            task_queue: "swe-workers".to_string(),
        }
    }
}

/// LLM provider settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmConfig {
    /// LiteLLM proxy URL
    pub proxy_url: String,
    /// Default model to use
    pub default_model: String,
    /// Model overrides per agent role
    #[serde(default)]
    pub role_models: std::collections::HashMap<String, String>,
}

impl Default for LlmConfig {
    fn default() -> Self {
        Self {
            proxy_url: "http://localhost:4000".to_string(),
            default_model: "gpt-4o".to_string(),
            role_models: std::collections::HashMap::new(),
        }
    }
}

/// Kubernetes settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KubernetesConfig {
    /// Kubeconfig path (None = default)
    pub kubeconfig: Option<PathBuf>,
    /// Namespace for sandbox pods
    pub sandbox_namespace: String,
    /// Default resource limits for sandboxes
    pub default_cpu_limit: String,
    pub default_memory_limit: String,
    /// Sandbox timeout in seconds
    pub sandbox_timeout_seconds: u64,
}

impl Default for KubernetesConfig {
    fn default() -> Self {
        Self {
            kubeconfig: None,
            sandbox_namespace: "swe-sandboxes".to_string(),
            default_cpu_limit: "1".to_string(),
            default_memory_limit: "2Gi".to_string(),
            sandbox_timeout_seconds: 3600,
        }
    }
}

/// API server settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiConfig {
    /// Host to bind to
    pub host: String,
    /// Port to listen on
    pub port: u16,
    /// Enable CORS
    pub cors_enabled: bool,
    /// Allowed origins (if CORS enabled)
    pub cors_origins: Vec<String>,
}

impl Default for ApiConfig {
    fn default() -> Self {
        Self {
            host: "0.0.0.0".to_string(),
            port: 8080,
            cors_enabled: true,
            cors_origins: vec!["http://localhost:3000".to_string()],
        }
    }
}

/// Database settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    /// PostgreSQL connection URL
    pub url: String,
    /// Maximum connections in pool
    pub max_connections: u32,
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            url: "postgres://swe:swe@localhost:5432/swe".to_string(),
            max_connections: 10,
        }
    }
}
