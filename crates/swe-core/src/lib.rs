//! # SWE Core
//!
//! Core domain types, configuration, and shared logic for the SWE platform.
//!
//! This crate contains:
//! - Domain types (Project, Agent, WorkItem, Artifact)
//! - Configuration parsing (TOML-based)
//! - Agent role definitions
//! - Error types

pub mod config;
pub mod db;
pub mod errors;
pub mod roles;
pub mod types;

pub use config::Config;
pub use errors::{Error, Result};
pub use roles::AgentRole;
pub use types::*;
