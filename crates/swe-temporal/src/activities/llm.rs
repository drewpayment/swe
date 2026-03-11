//! LLM activity implementation.
//!
//! Handles communication with LLM providers via LiteLLM proxy.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::{ActivityResult, SweActivity};

/// Message in a conversation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    /// Role: system, user, or assistant
    pub role: String,
    /// Message content
    pub content: String,
}

/// Request for LLM completion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletionRequest {
    /// Model to use (e.g., "gpt-4o", "claude-3-opus")
    pub model: String,
    /// Conversation messages
    pub messages: Vec<ChatMessage>,
    /// Optional system prompt (prepended to messages)
    pub system_prompt: Option<String>,
    /// Maximum tokens to generate
    pub max_tokens: Option<u32>,
    /// Temperature (0.0 - 2.0)
    pub temperature: Option<f32>,
    /// Available tools/functions
    pub tools: Option<Vec<ToolDefinition>>,
}

/// Tool/function definition for function calling.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    /// Tool name
    pub name: String,
    /// Tool description
    pub description: String,
    /// JSON schema for parameters
    pub parameters: serde_json::Value,
}

/// Response from LLM completion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletionResponse {
    /// Generated content
    pub content: String,
    /// Tool calls requested by the model
    pub tool_calls: Vec<ToolCall>,
    /// Tokens used for input
    pub input_tokens: u32,
    /// Tokens used for output
    pub output_tokens: u32,
    /// Model used
    pub model: String,
    /// Finish reason
    pub finish_reason: String,
}

/// A tool call requested by the model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    /// Tool call ID
    pub id: String,
    /// Tool name
    pub name: String,
    /// Arguments as JSON
    pub arguments: serde_json::Value,
}

/// LLM activity for making completion requests.
pub struct LlmActivity {
    /// LiteLLM proxy URL
    proxy_url: String,
}

impl LlmActivity {
    /// Create a new LLM activity.
    pub fn new(proxy_url: impl Into<String>) -> Self {
        Self {
            proxy_url: proxy_url.into(),
        }
    }

    /// Make a completion request.
    pub async fn complete(&self, request: CompletionRequest) -> ActivityResult<CompletionResponse> {
        let client = reqwest::Client::new();
        
        // Build messages with optional system prompt
        let mut messages = request.messages.clone();
        if let Some(system) = &request.system_prompt {
            messages.insert(0, ChatMessage {
                role: "system".to_string(),
                content: system.clone(),
            });
        }

        // Build request body
        let mut body = serde_json::json!({
            "model": request.model,
            "messages": messages,
        });

        if let Some(max_tokens) = request.max_tokens {
            body["max_tokens"] = serde_json::json!(max_tokens);
        }
        if let Some(temp) = request.temperature {
            body["temperature"] = serde_json::json!(temp);
        }
        if let Some(tools) = &request.tools {
            body["tools"] = serde_json::to_value(tools)
                .map_err(|e| swe_core::Error::Serialization(e.to_string()))?;
        }

        // Make request to LiteLLM proxy
        let response: reqwest::Response = client
            .post(format!("{}/v1/chat/completions", self.proxy_url))
            .json(&body)
            .send()
            .await
            .map_err(|e| swe_core::Error::Llm(format!("Request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let text: String = response.text().await.unwrap_or_default();
            return Err(swe_core::Error::Llm(format!(
                "LLM request failed with status {}: {}",
                status, text
            )));
        }

        let response_body: serde_json::Value = response
            .json::<serde_json::Value>()
            .await
            .map_err(|e| swe_core::Error::Llm(format!("Failed to parse response: {}", e)))?;

        // Parse response
        let choice = &response_body["choices"][0];
        let message = &choice["message"];

        let tool_calls: Vec<ToolCall> = if let Some(calls) = message["tool_calls"].as_array() {
            calls
                .iter()
                .filter_map(|c| {
                    Some(ToolCall {
                        id: c["id"].as_str()?.to_string(),
                        name: c["function"]["name"].as_str()?.to_string(),
                        arguments: serde_json::from_str::<serde_json::Value>(
                            c["function"]["arguments"].as_str().unwrap_or("{}"),
                        )
                        .unwrap_or_default(),
                    })
                })
                .collect()
        } else {
            Vec::new()
        };

        Ok(CompletionResponse {
            content: message["content"].as_str().unwrap_or("").to_string(),
            tool_calls,
            input_tokens: response_body["usage"]["prompt_tokens"].as_u64().unwrap_or(0) as u32,
            output_tokens: response_body["usage"]["completion_tokens"]
                .as_u64()
                .unwrap_or(0) as u32,
            model: response_body["model"].as_str().unwrap_or("").to_string(),
            finish_reason: choice["finish_reason"]
                .as_str()
                .unwrap_or("stop")
                .to_string(),
        })
    }
}

#[async_trait]
impl SweActivity for LlmActivity {
    fn name(&self) -> &'static str {
        "llm_complete"
    }
}
