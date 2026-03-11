//! # SWE Sandbox
//!
//! K8s Job management for agent execution environments.
//!
//! This crate handles:
//! - Creating and managing K8s Jobs for agent sandboxes
//! - Building sandbox images per agent role
//! - Managing workspace volumes and mounts
//! - Monitoring sandbox health and resource usage

pub mod images;
pub mod runtime;
pub mod volume;

use k8s_openapi::api::batch::v1::Job;
use k8s_openapi::api::core::v1::Pod;
use kube::{Api, Client};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use swe_core::AgentRole;

/// Configuration for a sandbox.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxConfig {
    /// Agent ID
    pub agent_id: Uuid,
    /// Agent role
    pub role: AgentRole,
    /// K8s namespace
    pub namespace: String,
    /// Container image
    pub image: String,
    /// CPU limit (e.g., "1", "500m")
    pub cpu_limit: String,
    /// Memory limit (e.g., "2Gi", "512Mi")
    pub memory_limit: String,
    /// Timeout in seconds
    pub timeout_seconds: u64,
    /// Environment variables
    pub env_vars: std::collections::HashMap<String, String>,
    /// Volume mounts
    pub volume_mounts: Vec<volume::VolumeMountConfig>,
}

impl SandboxConfig {
    /// Create a default config for an agent role.
    pub fn for_role(agent_id: Uuid, role: AgentRole) -> Self {
        Self {
            agent_id,
            role,
            namespace: "swe-sandboxes".to_string(),
            image: images::image_for_role(role).to_string(),
            cpu_limit: "1".to_string(),
            memory_limit: "2Gi".to_string(),
            timeout_seconds: 3600,
            env_vars: std::collections::HashMap::new(),
            volume_mounts: Vec::new(),
        }
    }
}

/// Sandbox manager for creating and managing K8s Jobs.
pub struct SandboxManager {
    client: Client,
    namespace: String,
}

impl SandboxManager {
    /// Create a new sandbox manager.
    pub async fn new(namespace: &str) -> Result<Self, swe_core::Error> {
        let client = Client::try_default()
            .await
            .map_err(|e| swe_core::Error::Kubernetes(format!("Failed to create K8s client: {}", e)))?;

        Ok(Self {
            client,
            namespace: namespace.to_string(),
        })
    }

    /// Create a sandbox Job.
    pub async fn create(&self, config: &SandboxConfig) -> Result<String, swe_core::Error> {
        let job_name = format!("swe-sandbox-{}", Uuid::new_v4());
        
        // Build Job spec
        let job = runtime::build_job_spec(&job_name, config);
        
        let jobs: Api<Job> = Api::namespaced(self.client.clone(), &self.namespace);
        jobs.create(&Default::default(), &job)
            .await
            .map_err(|e| swe_core::Error::Kubernetes(format!("Failed to create job: {}", e)))?;

        tracing::info!(%job_name, agent_id = %config.agent_id, "Created sandbox job");
        
        Ok(job_name)
    }

    /// Delete a sandbox Job.
    pub async fn delete(&self, job_name: &str) -> Result<(), swe_core::Error> {
        let jobs: Api<Job> = Api::namespaced(self.client.clone(), &self.namespace);
        jobs.delete(job_name, &Default::default())
            .await
            .map_err(|e| swe_core::Error::Kubernetes(format!("Failed to delete job: {}", e)))?;

        tracing::info!(%job_name, "Deleted sandbox job");
        Ok(())
    }

    /// List active sandboxes.
    pub async fn list(&self) -> Result<Vec<String>, swe_core::Error> {
        let jobs: Api<Job> = Api::namespaced(self.client.clone(), &self.namespace);
        let job_list = jobs
            .list(&Default::default())
            .await
            .map_err(|e| swe_core::Error::Kubernetes(format!("Failed to list jobs: {}", e)))?;

        Ok(job_list
            .items
            .iter()
            .filter_map(|j| j.metadata.name.clone())
            .collect())
    }

    /// Get sandbox logs.
    pub async fn logs(&self, job_name: &str) -> Result<String, swe_core::Error> {
        // Find the pod for this job
        let pods: Api<Pod> = Api::namespaced(self.client.clone(), &self.namespace);
        let pod_list = pods
            .list(&Default::default())
            .await
            .map_err(|e| swe_core::Error::Kubernetes(format!("Failed to list pods: {}", e)))?;

        // Find pod matching job name
        if let Some(pod) = pod_list.items.iter().find(|p| {
            p.metadata
                .name
                .as_ref()
                .map(|n| n.starts_with(job_name))
                .unwrap_or(false)
        }) {
            let pod_name = pod.metadata.name.as_ref().unwrap();
            let logs = pods
                .logs(pod_name, &Default::default())
                .await
                .map_err(|e| swe_core::Error::Kubernetes(format!("Failed to get logs: {}", e)))?;
            Ok(logs)
        } else {
            Err(swe_core::Error::Kubernetes(format!(
                "No pod found for job {}",
                job_name
            )))
        }
    }
}
