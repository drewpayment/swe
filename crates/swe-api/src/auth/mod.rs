//! Authentication and authorization.
//!
//! Stub module - will integrate with BetterAuth from the Next.js frontend.

use serde::{Deserialize, Serialize};

/// Authenticated user.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthenticatedUser {
    /// User ID
    pub id: String,
    /// Email address
    pub email: String,
    /// Display name
    pub name: Option<String>,
    /// Roles/permissions
    pub roles: Vec<String>,
}

/// API key authentication.
#[derive(Debug, Clone)]
pub struct ApiKeyAuth {
    /// Valid API keys (stub - would use database)
    valid_keys: Vec<String>,
}

impl ApiKeyAuth {
    /// Create a new API key authenticator.
    pub fn new() -> Self {
        Self {
            valid_keys: Vec::new(),
        }
    }

    /// Validate an API key.
    pub fn validate(&self, key: &str) -> Option<AuthenticatedUser> {
        // Stub - would look up key in database
        if self.valid_keys.contains(&key.to_string()) {
            Some(AuthenticatedUser {
                id: "api-user".to_string(),
                email: "api@swe.local".to_string(),
                name: Some("API User".to_string()),
                roles: vec!["api".to_string()],
            })
        } else {
            None
        }
    }
}

impl Default for ApiKeyAuth {
    fn default() -> Self {
        Self::new()
    }
}
