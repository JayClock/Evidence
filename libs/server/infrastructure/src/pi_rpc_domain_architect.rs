use std::{path::PathBuf, process::Stdio, time::Duration};

use async_stream::try_stream;
use evidence_server_domain::{
    DomainArchitect, DomainArchitectEventStream, ModelingEvent, ServerError,
};
use serde_json::{json, Value};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    process::Command,
    time,
};

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Debug, Clone)]
pub struct PiRpcDomainArchitectConfig {
    pub command: String,
    pub args: Vec<String>,
    pub timeout: Duration,
}

impl Default for PiRpcDomainArchitectConfig {
    fn default() -> Self {
        Self {
            command: "pi".to_string(),
            args: vec![
                "--mode".to_string(),
                "rpc".to_string(),
                "--no-session".to_string(),
                "--no-tools".to_string(),
            ],
            timeout: DEFAULT_TIMEOUT,
        }
    }
}

fn workspace_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.."))
}

fn evidence_modeling_dir() -> PathBuf {
    let path = workspace_root().join(".evidence");
    path.canonicalize().unwrap_or(path)
}

#[derive(Debug, Clone, Default)]
pub struct PiRpcDomainArchitect {
    config: PiRpcDomainArchitectConfig,
}

impl PiRpcDomainArchitect {
    pub fn new(config: PiRpcDomainArchitectConfig) -> Self {
        Self { config }
    }

    pub fn with_command(command: impl Into<String>) -> Self {
        Self::new(PiRpcDomainArchitectConfig {
            command: command.into(),
            ..PiRpcDomainArchitectConfig::default()
        })
    }
}

impl DomainArchitect for PiRpcDomainArchitect {
    fn propose_model_stream(&self, requirement: String) -> DomainArchitectEventStream {
        let config = self.config.clone();

        Box::pin(try_stream! {
            let message = requirement;
            let mut command = Command::new(&config.command);
            command
                .args(&config.args)
                .current_dir(evidence_modeling_dir())
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .kill_on_drop(true);

            let mut child = command.spawn().map_err(|error| {
                ServerError::Internal(format!("failed to start pi rpc process: {error}"))
            })?;

            let mut stdin = child
                .stdin
                .take()
                .ok_or_else(|| ServerError::Internal("pi rpc stdin unavailable".to_string()))?;
            let stdout = child
                .stdout
                .take()
                .ok_or_else(|| ServerError::Internal("pi rpc stdout unavailable".to_string()))?;
            let mut stderr = child
                .stderr
                .take()
                .ok_or_else(|| ServerError::Internal("pi rpc stderr unavailable".to_string()))?;

            let rpc_command = json!({
                "id": "evidence-chat",
                "type": "prompt",
                "message": message,
            });
            stdin
                .write_all(rpc_command.to_string().as_bytes())
                .await
                .map_err(|error| {
                    ServerError::Internal(format!("failed to write pi rpc message: {error}"))
                })?;
            stdin.write_all(b"\n").await.map_err(|error| {
                ServerError::Internal(format!("failed to write pi rpc message: {error}"))
            })?;
            stdin.flush().await.map_err(|error| {
                ServerError::Internal(format!("failed to flush pi rpc message: {error}"))
            })?;

            let mut lines = BufReader::new(stdout).lines();
            let mut assistant_text = String::new();
            let mut accepted = false;
            let mut saw_message_end = false;
            let mut saw_agent_end = false;

            loop {
                let maybe_line = time::timeout(config.timeout, lines.next_line())
                    .await
                    .map_err(|_| ServerError::Internal("pi rpc request timed out".to_string()))?
                    .map_err(|error| {
                        ServerError::Internal(format!("failed to read pi rpc output: {error}"))
                    })?;
                let Some(line) = maybe_line else {
                    break;
                };

                if line.trim().is_empty() {
                    continue;
                }

                let event: Value = serde_json::from_str(&line).map_err(|error| {
                    ServerError::Internal(format!("failed to parse pi rpc JSON line: {error}"))
                })?;

                match event.get("type").and_then(Value::as_str) {
                    Some("response") => {
                        if event.get("command").and_then(Value::as_str) == Some("prompt") {
                            if event.get("success").and_then(Value::as_bool) == Some(false) {
                                let error = event
                                    .get("error")
                                    .and_then(Value::as_str)
                                    .unwrap_or("pi rpc message rejected");
                                let _ = child.kill().await;
                                Err(ServerError::Internal(error.to_string()))?;
                            }
                            accepted = true;
                        }
                    }
                    Some("message_update") => {
                        let assistant_event = event
                            .get("assistantMessageEvent")
                            .unwrap_or(&Value::Null);
                        match assistant_event.get("type").and_then(Value::as_str) {
                            Some("text_delta") => {
                                if let Some(delta) = assistant_event.get("delta").and_then(Value::as_str) {
                                    assistant_text.push_str(delta);
                                    yield ModelingEvent::TextChunk { chunk: delta.to_string() };
                                }
                            }
                            Some("thinking_start") => {
                                yield ModelingEvent::ReasoningStarted;
                            }
                            Some("thinking_delta") => {
                                if let Some(delta) = assistant_event.get("delta").and_then(Value::as_str) {
                                    yield ModelingEvent::ReasoningChunk { chunk: delta.to_string() };
                                }
                            }
                            Some("thinking_end") => {
                                yield ModelingEvent::ReasoningEnded;
                            }
                            Some("toolcall_start") => {
                                let tool_call_id = tool_call_id(assistant_event)?;
                                let tool_name = tool_name(assistant_event);
                                yield ModelingEvent::ToolCallStarted { tool_call_id, tool_name };
                            }
                            Some("toolcall_delta") => {
                                if let Some(delta) = assistant_event.get("delta").and_then(Value::as_str) {
                                    let tool_call_id = tool_call_id(assistant_event)?;
                                    let tool_name = tool_name(assistant_event);
                                    yield ModelingEvent::ToolCallDelta {
                                        tool_call_id,
                                        tool_name,
                                        chunk: delta.to_string(),
                                    };
                                }
                            }
                            Some("toolcall_end") => {
                                if let Some(tool_call) = assistant_event.get("toolCall") {
                                    let tool_call_id = tool_call_id(assistant_event)?;
                                    let tool_name = tool_call
                                        .get("name")
                                        .and_then(Value::as_str)
                                        .unwrap_or("tool")
                                        .to_string();
                                    let input = tool_call
                                        .get("arguments")
                                        .cloned()
                                        .unwrap_or(Value::Null);
                                    yield ModelingEvent::ToolCallReady { tool_call_id, tool_name, input };
                                }
                            }
                            _ => {}
                        }
                    }
                    Some("tool_execution_start") => {
                        yield ModelingEvent::ToolExecutionStarted {
                            tool_call_id: required_event_string(&event, "toolCallId")?,
                            tool_name: event_string(&event, "toolName", "tool"),
                            args: event.get("args").cloned().unwrap_or(Value::Null),
                        };
                    }
                    Some("tool_execution_update") => {
                        yield ModelingEvent::ToolExecutionUpdated {
                            tool_call_id: required_event_string(&event, "toolCallId")?,
                            tool_name: event_string(&event, "toolName", "tool"),
                            args: event.get("args").cloned().unwrap_or(Value::Null),
                            partial_result: event.get("partialResult").cloned().unwrap_or(Value::Null),
                        };
                    }
                    Some("tool_execution_end") => {
                        let tool_call_id = required_event_string(&event, "toolCallId")?;
                        let tool_name = event_string(&event, "toolName", "tool");
                        let result = event.get("result").cloned().unwrap_or(Value::Null);
                        let is_error = event.get("isError").and_then(Value::as_bool).unwrap_or(false);
                        yield ModelingEvent::ToolExecutionEnded {
                            tool_call_id,
                            tool_name,
                            result,
                            is_error,
                        };
                    }
                    Some("message_end") => {
                        saw_message_end = true;
                        if assistant_text.trim().is_empty() {
                            let text = extract_message_text(
                                event.get("message").unwrap_or(&Value::Null),
                            );
                            if !text.is_empty() {
                                assistant_text.push_str(&text);
                                yield ModelingEvent::TextChunk { chunk: text };
                            }
                        }
                    }
                    Some("agent_end") => {
                        saw_agent_end = true;
                        if assistant_text.trim().is_empty() {
                            let text = extract_agent_end_text(&event);
                            if !text.is_empty() {
                                assistant_text.push_str(&text);
                                yield ModelingEvent::TextChunk { chunk: text };
                            }
                        }
                        break;
                    }
                    _ => {}
                }
            }

            let _ = child.kill().await;
            let mut stderr_output = String::new();
            let _ = time::timeout(
                Duration::from_secs(1),
                stderr.read_to_string(&mut stderr_output),
            )
            .await;

            if !accepted {
                Err(ServerError::Internal(format!(
                    "pi rpc process ended before accepting message{}",
                    stderr_detail(&stderr_output)
                )))?;
            }

            if saw_message_end {
                yield ModelingEvent::MessageEnded;
            }
            if saw_agent_end {
                yield ModelingEvent::AgentEnded;
            }
            yield ModelingEvent::Completed;
        })
    }
}

fn tool_call_id(assistant_event: &Value) -> Result<String, ServerError> {
    if let Some(id) = assistant_event
        .get("toolCall")
        .and_then(|tool_call| tool_call.get("id"))
        .and_then(Value::as_str)
    {
        return Ok(id.to_string());
    }

    if let Some(id) = assistant_event.get("toolCallId").and_then(Value::as_str) {
        return Ok(id.to_string());
    }

    if let Some(content_index) = assistant_event.get("contentIndex").and_then(Value::as_u64) {
        if let Some(id) = assistant_event
            .get("partial")
            .and_then(|partial| partial.get("content"))
            .and_then(Value::as_array)
            .and_then(|content| content.get(content_index as usize))
            .and_then(|tool_call| tool_call.get("id"))
            .and_then(Value::as_str)
        {
            return Ok(id.to_string());
        }
    }

    Err(ServerError::Internal(
        "pi rpc tool call id missing".to_string(),
    ))
}

fn tool_name(assistant_event: &Value) -> Option<String> {
    assistant_event
        .get("toolCall")
        .and_then(|tool_call| tool_call.get("name"))
        .and_then(Value::as_str)
        .or_else(|| assistant_event.get("toolName").and_then(Value::as_str))
        .map(str::to_string)
}

fn required_event_string(event: &Value, key: &str) -> Result<String, ServerError> {
    event
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| ServerError::Internal(format!("pi rpc {key} missing")))
}

fn event_string(event: &Value, key: &str, fallback: &str) -> String {
    event
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or(fallback)
        .to_string()
}

fn stderr_detail(stderr: &str) -> String {
    let trimmed = stderr.trim();
    if trimmed.is_empty() {
        String::new()
    } else {
        format!(": {trimmed}")
    }
}

fn extract_agent_end_text(event: &Value) -> String {
    event
        .get("messages")
        .and_then(Value::as_array)
        .and_then(|messages| {
            messages
                .iter()
                .rev()
                .find(|message| message.get("role").and_then(Value::as_str) == Some("assistant"))
        })
        .map(extract_message_text)
        .unwrap_or_default()
}

fn extract_message_text(message: &Value) -> String {
    match message.get("content") {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Array(parts)) => parts
            .iter()
            .filter_map(|part| {
                if part.get("type").and_then(Value::as_str) == Some("text") {
                    part.get("text").and_then(Value::as_str)
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join(""),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_text_from_agent_end_event() {
        let event = json!({
            "type": "agent_end",
            "messages": [
                {"role": "user", "content": "hello"},
                {"role": "assistant", "content": [{"type": "text", "text": "{\"summary\":null}"}]}
            ]
        });

        assert_eq!(extract_agent_end_text(&event), "{\"summary\":null}");
    }
}
