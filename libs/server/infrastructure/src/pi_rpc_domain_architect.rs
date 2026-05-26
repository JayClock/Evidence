use std::{process::Stdio, time::Duration};

use async_stream::try_stream;
use async_trait::async_trait;
use evidence_server_domain::{
    DomainArchitect, DomainArchitectEventStream, ModelingEvent, ModelingProposal, ServerError,
};
use futures_util::StreamExt;
use serde_json::{json, Value};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
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
            ],
            timeout: DEFAULT_TIMEOUT,
        }
    }
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

#[async_trait]
impl DomainArchitect for PiRpcDomainArchitect {
    async fn propose_model(&self, requirement: String) -> Result<ModelingProposal, ServerError> {
        let mut stream = self.propose_model_stream(requirement);

        while let Some(event) = stream.next().await {
            if let ModelingEvent::ProposalReady { proposal } = event? {
                return Ok(proposal);
            }
        }

        Err(ServerError::Internal(
            "pi rpc stream ended before returning a modeling proposal".to_string(),
        ))
    }

    fn propose_model_stream(&self, requirement: String) -> DomainArchitectEventStream {
        let config = self.config.clone();

        Box::pin(try_stream! {
            let prompt = build_prompt(&requirement);
            let mut command = Command::new(&config.command);
            command
                .args(&config.args)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
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

            let rpc_command = json!({
                "id": "evidence-domain-architect",
                "type": "prompt",
                "message": prompt,
            });
            stdin
                .write_all(rpc_command.to_string().as_bytes())
                .await
                .map_err(|error| {
                    ServerError::Internal(format!("failed to write pi rpc prompt: {error}"))
                })?;
            stdin.write_all(b"\n").await.map_err(|error| {
                ServerError::Internal(format!("failed to write pi rpc prompt: {error}"))
            })?;
            stdin.flush().await.map_err(|error| {
                ServerError::Internal(format!("failed to flush pi rpc prompt: {error}"))
            })?;

            let mut lines = BufReader::new(stdout).lines();
            let mut assistant_text = String::new();
            let mut accepted = false;

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
                                    .unwrap_or("pi rpc prompt rejected");
                                let _ = child.kill().await;
                                Err(ServerError::Internal(error.to_string()))?;
                            }
                            accepted = true;
                        }
                    }
                    Some("message_update") => {
                        if let Some(delta) = event
                            .get("assistantMessageEvent")
                            .and_then(|value| value.get("delta"))
                            .and_then(Value::as_str)
                        {
                            assistant_text.push_str(delta);
                            yield ModelingEvent::StructuredChunk {
                                kind: "diagram-model".to_string(),
                                format: "json".to_string(),
                                chunk: delta.to_string(),
                            };
                        }
                    }
                    Some("message_end") => {
                        if assistant_text.trim().is_empty() {
                            assistant_text.push_str(&extract_message_text(
                                event.get("message").unwrap_or(&Value::Null),
                            ));
                        }
                    }
                    Some("agent_end") => {
                        if assistant_text.trim().is_empty() {
                            assistant_text.push_str(&extract_agent_end_text(&event));
                        }
                        break;
                    }
                    _ => {}
                }
            }

            let _ = child.kill().await;

            if !accepted {
                Err(ServerError::Internal(
                    "pi rpc process ended before accepting prompt".to_string(),
                ))?;
            }

            let assistant_text = assistant_text.trim().to_string();
            if assistant_text.is_empty() {
                Err(ServerError::Internal(
                    "pi rpc returned an empty assistant response".to_string(),
                ))?;
            }

            yield ModelingEvent::ProposalReady {
                proposal: parse_modeling_proposal(&assistant_text)?,
            };
        })
    }
}

fn build_prompt(requirement: &str) -> String {
    format!(
        r#"You are the Evidence Domain Architect.

User requirement:
{requirement}

Task:
- Propose domain-modeling changes for the user's requirement.
- Stream exactly one JSON object and no markdown prose.
- Do not modify files, call tools, or execute commands.
- Use the same proposal shape as Team AI DraftDiagram:
  {{
    "summary": {{
      "message": "short human-readable summary",
      "addNodes": 0,
      "addEdges": 0,
      "updateNodes": 0,
      "updateEdges": 0,
      "deleteNodes": 0,
      "deleteEdges": 0
    }},
    "operations": [
      {{
        "type": "ADD_NODE | UPDATE_NODE | DELETE_NODE | ADD_EDGE | UPDATE_EDGE | DELETE_EDGE",
        "targetId": "required for update/delete operations",
        "node": {{
          "id": "node-1",
          "parent": {{ "id": "parent-node-id" }},
          "localData": {{
            "name": "contract",
            "label": "Contract",
            "type": "EVIDENCE | PARTICIPANT | ROLE | CONTEXT",
            "subType": "contract"
          }}
        }},
        "edge": {{
          "sourceNode": {{ "id": "source-node-id" }},
          "targetNode": {{ "id": "target-node-id" }}
        }},
        "reason": "why this operation is proposed"
      }}
    ]
  }}
- For ADD_NODE include node. For ADD_EDGE include edge.
- For UPDATE_NODE/UPDATE_EDGE include targetId and replacement node/edge payload.
- For DELETE_NODE/DELETE_EDGE include targetId only.
- ADD_EDGE sourceNode/targetNode must reference node ids introduced by ADD_NODE in the same proposal.
- If no executable operation contract is available, return an empty operations array and explain in summary.message.
"#
    )
}

fn parse_modeling_proposal(text: &str) -> Result<ModelingProposal, ServerError> {
    let candidate = json_candidate(text).ok_or_else(|| {
        ServerError::Internal("pi rpc response did not contain a JSON object".to_string())
    })?;

    serde_json::from_str(candidate).map_err(|error| {
        ServerError::Internal(format!("failed to parse pi rpc modeling proposal: {error}"))
    })
}

fn json_candidate(text: &str) -> Option<&str> {
    let trimmed = text.trim();
    if trimmed.starts_with('{') && trimmed.ends_with('}') {
        return Some(trimmed);
    }

    if let Some(start) = trimmed.find("```json") {
        let after_marker = &trimmed[start + "```json".len()..];
        if let Some(end) = after_marker.find("```") {
            return Some(after_marker[..end].trim());
        }
    }

    if let Some(start) = trimmed.find("```") {
        let after_marker = &trimmed[start + "```".len()..];
        if let Some(end) = after_marker.find("```") {
            return Some(after_marker[..end].trim());
        }
    }

    let start = trimmed.find('{')?;
    let end = trimmed.rfind('}')?;
    (start < end).then_some(trimmed[start..=end].trim())
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
    fn parses_plain_json_proposal() {
        let proposal = parse_modeling_proposal(
            r#"{"summary":{"message":"Create model","addNodes":0,"addEdges":0,"updateNodes":0,"updateEdges":0,"deleteNodes":0,"deleteEdges":0},"operations":[]}"#,
        )
        .unwrap();

        assert_eq!(
            proposal
                .summary
                .as_ref()
                .and_then(|summary| summary.message.as_deref()),
            Some("Create model")
        );
        assert!(proposal.safe_operations().is_empty());
    }

    #[test]
    fn parses_fenced_json_proposal() {
        let proposal = parse_modeling_proposal(
            r#"Here is the proposal:
```json
{"summary":{"message":"Ask follow-up"},"operations":[]}
```
"#,
        )
        .unwrap();

        assert_eq!(
            proposal
                .summary
                .as_ref()
                .and_then(|summary| summary.message.as_deref()),
            Some("Ask follow-up")
        );
    }

    #[test]
    fn parses_team_ai_add_node_operation() {
        let proposal = parse_modeling_proposal(
            r#"{
              "summary": {"message": "Add contract", "addNodes": 1},
              "operations": [{
                "type": "ADD_NODE",
                "node": {
                  "id": "node-1",
                  "parent": null,
                  "localData": {
                    "name": "contract",
                    "label": "Contract",
                    "type": "EVIDENCE",
                    "subType": "contract"
                  }
                },
                "reason": "Contract anchors the fulfillment model."
              }]
            }"#,
        )
        .unwrap();

        assert_eq!(proposal.safe_operations().len(), 1);
    }

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
