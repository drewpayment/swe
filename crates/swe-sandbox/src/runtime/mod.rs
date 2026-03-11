//! K8s Job runtime builder.

use k8s_openapi::api::batch::v1::{Job, JobSpec};
use k8s_openapi::api::core::v1::{
    Container, EnvVar, PodSpec, PodTemplateSpec, ResourceRequirements,
};
use k8s_openapi::apimachinery::pkg::api::resource::Quantity;
use std::collections::BTreeMap;

use super::SandboxConfig;

/// Build a K8s Job spec for a sandbox.
pub fn build_job_spec(name: &str, config: &SandboxConfig) -> Job {
    let mut labels = BTreeMap::new();
    labels.insert("app".to_string(), "swe-sandbox".to_string());
    labels.insert("agent-id".to_string(), config.agent_id.to_string());
    labels.insert("role".to_string(), format!("{:?}", config.role).to_lowercase());

    let env_vars: Vec<EnvVar> = config
        .env_vars
        .iter()
        .map(|(k, v)| EnvVar {
            name: k.clone(),
            value: Some(v.clone()),
            ..Default::default()
        })
        .chain(vec![
            EnvVar {
                name: "SWE_AGENT_ID".to_string(),
                value: Some(config.agent_id.to_string()),
                ..Default::default()
            },
            EnvVar {
                name: "SWE_ROLE".to_string(),
                value: Some(format!("{:?}", config.role)),
                ..Default::default()
            },
        ])
        .collect();

    let mut resource_limits = BTreeMap::new();
    resource_limits.insert("cpu".to_string(), Quantity(config.cpu_limit.clone()));
    resource_limits.insert("memory".to_string(), Quantity(config.memory_limit.clone()));

    let container = Container {
        name: "sandbox".to_string(),
        image: Some(config.image.clone()),
        env: Some(env_vars),
        resources: Some(ResourceRequirements {
            limits: Some(resource_limits),
            ..Default::default()
        }),
        ..Default::default()
    };

    Job {
        metadata: k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta {
            name: Some(name.to_string()),
            namespace: Some(config.namespace.clone()),
            labels: Some(labels.clone()),
            ..Default::default()
        },
        spec: Some(JobSpec {
            backoff_limit: Some(0),
            active_deadline_seconds: Some(config.timeout_seconds as i64),
            template: PodTemplateSpec {
                metadata: Some(k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta {
                    labels: Some(labels),
                    ..Default::default()
                }),
                spec: Some(PodSpec {
                    containers: vec![container],
                    restart_policy: Some("Never".to_string()),
                    ..Default::default()
                }),
            },
            ..Default::default()
        }),
        ..Default::default()
    }
}
