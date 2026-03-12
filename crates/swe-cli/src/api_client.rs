//! HTTP client for the SWE API.

use serde::{de::DeserializeOwned, Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

pub struct ApiClient {
    base_url: String,
    client: reqwest::Client,
}

impl ApiClient {
    pub fn new(base_url: &str) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            client: reqwest::Client::new(),
        }
    }

    pub async fn get<T: DeserializeOwned>(&self, path: &str) -> anyhow::Result<ApiResponse<T>> {
        let resp = self
            .client
            .get(format!("{}{}", self.base_url, path))
            .send()
            .await?
            .json::<ApiResponse<T>>()
            .await?;
        Ok(resp)
    }

    pub async fn post<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
    ) -> anyhow::Result<ApiResponse<T>> {
        let resp = self
            .client
            .post(format!("{}{}", self.base_url, path))
            .json(body)
            .send()
            .await?
            .json::<ApiResponse<T>>()
            .await?;
        Ok(resp)
    }

    pub async fn delete<T: DeserializeOwned>(&self, path: &str) -> anyhow::Result<ApiResponse<T>> {
        let resp = self
            .client
            .delete(format!("{}{}", self.base_url, path))
            .send()
            .await?
            .json::<ApiResponse<T>>()
            .await?;
        Ok(resp)
    }

    pub async fn health(&self) -> anyhow::Result<bool> {
        let resp = self
            .client
            .get(format!("{}/health", self.base_url))
            .send()
            .await;
        Ok(resp.is_ok())
    }
}
