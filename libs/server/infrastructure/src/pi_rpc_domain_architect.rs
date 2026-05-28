use std::{path::PathBuf, process::Stdio, time::Duration};

use async_stream::try_stream;
use evidence_server_domain::{
    DomainArchitect, DomainArchitectEventStream, ModelingEvent, ModelingProposal, ServerError,
};
use serde_json::{json, Value};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    process::Command,
    time,
};

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(120);
const PROPOSAL_TOOL_NAME: &str = "submit_modeling_proposal";

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
                "--no-extensions".to_string(),
                "-e".to_string(),
                default_extension_path(),
                "--no-builtin-tools".to_string(),
                "--tools".to_string(),
                PROPOSAL_TOOL_NAME.to_string(),
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

fn default_extension_path() -> String {
    workspace_root()
        .join(".pi/extensions/evidence-domain-architect.ts")
        .to_string_lossy()
        .into_owned()
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
            let prompt = build_prompt(&requirement);
            let mut command = Command::new(&config.command);
            command
                .args(&config.args)
                .current_dir(workspace_root())
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
            let mut submitted_proposal: Option<ModelingProposal> = None;
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
                                    .unwrap_or("pi rpc prompt rejected");
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
                                    if tool_name == PROPOSAL_TOOL_NAME {
                                        submitted_proposal = Some(parse_modeling_proposal_value(input.clone())?);
                                    }
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
                            tool_name: tool_name.clone(),
                            result: result.clone(),
                            is_error,
                        };
                        if tool_name == PROPOSAL_TOOL_NAME {
                            if is_error {
                                Err(ServerError::Internal(
                                    "pi rpc submit_modeling_proposal tool failed".to_string(),
                                ))?;
                            }
                            if let Some(proposal_value) = proposal_value_from_tool_result(&result) {
                                submitted_proposal = Some(parse_modeling_proposal_value(proposal_value)?);
                            }
                        }
                    }
                    Some("message_end") => {
                        saw_message_end = true;
                        if assistant_text.trim().is_empty() {
                            assistant_text.push_str(&extract_message_text(
                                event.get("message").unwrap_or(&Value::Null),
                            ));
                        }
                    }
                    Some("agent_end") => {
                        saw_agent_end = true;
                        if assistant_text.trim().is_empty() {
                            assistant_text.push_str(&extract_agent_end_text(&event));
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
                    "pi rpc process ended before accepting prompt{}",
                    stderr_detail(&stderr_output)
                )))?;
            }

            if submitted_proposal.is_none() {
                let assistant_text = assistant_text.trim();
                let detail = if assistant_text.is_empty() {
                    String::new()
                } else {
                    format!(" Assistant text was: {assistant_text}")
                };
                Err(ServerError::Internal(format!(
                    "pi rpc did not call {PROPOSAL_TOOL_NAME}.{detail}"
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

const DOMAIN_ARCHITECT_PROMPT: &str = r#"You are the Evidence Domain Architect.

Task:
- Propose Fulfillment Modeling (FM) diagram-modeling changes for the user's requirement.
- Call the submit_modeling_proposal tool exactly once with the FM changes payload.
- Do not emit markdown prose, JSON text, commentary, explanations, logs, or any prefix/suffix text outside the tool call.
- Do not call any tool except submit_modeling_proposal.
- Return only the FM changes payload below as the submit_modeling_proposal arguments; do not return an operations array.

FM modeling rules:
- Model business semantics only: contracts, obligations, roles, evidence, lifecycle facts, rules, downstream signals, and scenario paths. Do not model database tables, APIs, services, modules, queues, deployment, or framework components.
- Start from Contract context. Treat one Contract as one primary fulfillment chain. For multiple contracts, model each chain independently.
- Add RFP and Proposal only when the requirement contains a presales stage.
- Use Evidence-first discovery. Identify the anchor cash movement, KPI, or acceptance evidence, then discover the requests, confirmations, roles, and downstream evidence around it.
- Model every concrete responsibility or meaningful state transition as a Fulfillment Request -> Fulfillment Confirmation pair.
- Express lifecycle as attributes on Contract, Evidence, or Thing; do not create standalone status nodes.
- Put rules in request precondition, attribute calculationRule, Domain Role responsibility, notes, or validation notes.
- Every RFP, Proposal, Fulfillment Request, Fulfillment Confirmation, and Other Evidence must have exactly one participating Party Role.
- Use Other Evidence for same-context produced business documents. Use Evidence As Role only for cross-context bridging, and only in the pattern Fulfillment Confirmation -> Evidence As Role -> downstream Fulfillment Confirmation.
- Third Party Role and Context Role may participate only in Other Evidence or Evidence As Role.
- Edges are scalar 1:1 relations from cause to result or participant to evidence; never use arrays, comma-separated ids, or aggregate endpoints.

submit_modeling_proposal argument shape:
{
  "summary": "short human-readable summary",
  "changes": {
    "addNodes": [
      {
        "id": "node-1",
        "kind": "fulfillment-node | group-container | sticky-note",
        "parent": { "id": "parent-node-id" },
        "position": { "x": 0, "y": 0 },
        "width": null,
        "height": null,
        "data": {
          "name": "SalesContract",
          "label": "销售合同",
          "type": "EVIDENCE",
          "subType": "contract",
          "attributes": [],
          "notes": "optional short explanation"
        }
      }
    ],
    "updateNodes": [],
    "deleteNodes": [],
    "addEdges": [
      {
        "id": "edge-1",
        "source": { "id": "source-node-id" },
        "target": { "id": "target-node-id" },
        "sourceHandle": null,
        "targetHandle": null,
        "kind": "smoothstep",
        "relationType": "evidence_flow | request_confirmation | participation | role_play | cross_context_association",
        "label": "short business relationship phrase",
        "style": {},
        "data": { "sourceRelation": "1", "targetRelation": "1" },
        "animated": false,
        "hidden": false,
        "markerStart": null,
        "markerEnd": { "type": "arrowclosed" },
        "pathOptions": {},
        "interactionWidth": null
      }
    ],
    "updateEdges": [],
    "deleteEdges": []
  }
}

Node output constraints, aligned with the public node API model:
- Emit node fields only as: id, kind, parent, position, width, height, data. Do not emit _links, logicalEntity, logical_entity, parentId, extent, createdAt, or updatedAt.
- Use node.id with prefix node-. Context nodes should use prefix node-context- when helpful.
- Use node.kind = "group-container" for CONTEXT nodes, "fulfillment-node" for FM business nodes, or "sticky-note" only for explanatory notes.
- node.parent is either null or { "id": "context-node-id" }. Put every non-Context business-chain node inside its Context. Do not put Participant Party nodes inside Context containers.
- Always emit position { "x": 0, "y": 0 }. The frontend owns layout.
- node.data.type must be exactly one single literal: EVIDENCE, PARTICIPANT, ROLE, or CONTEXT. Never emit a combined placeholder like "EVIDENCE | PARTICIPANT | ROLE | CONTEXT".
- node.data.subType should use FM subtype values: rfp, proposal, contract, fulfillment_request, fulfillment_confirmation, other_evidence, party, thing, domain, 3rd system, context, evidence, bounded_context.
- node.data.name must be non-empty, unique, ASCII PascalCase. node.data.label is the user-facing business label.
- Evidence lifecycle attributes are mandatory: RFP/Proposal/Fulfillment Request need startedAt and expiredAt; Contract needs signedAt; Fulfillment Confirmation needs confirmedAt; Other Evidence needs createdAt. Use DateTime and required true.
- For derived values, use one parseable calculationRule assignment like amount = PaymentConfirmation.paidAmount. Put guard rules in precondition boolean expressions.

Edge output constraints, aligned with the public edge API model:
- Emit edge fields only as: id, source, target, sourceHandle, targetHandle, kind, relationType, label, style, data, animated, hidden, markerStart, markerEnd, pathOptions, interactionWidth. Do not emit _links, type, sourceNode, targetNode, createdAt, or updatedAt.
- Use edge.id with prefix edge-.
- edge.source and edge.target must be { "id": "node-id" } and must reference nodes introduced by changes.addNodes in the same proposal unless the user provided existing node ids.
- Use edge.kind = "smoothstep" by default. Do not use custom edge kind values unless explicitly requested.
- Always include edge.data.sourceRelation = "1" and edge.data.targetRelation = "1".
- For normal evidence flow and participation, use solid style {} and markerEnd { "type": "arrowclosed" }.
- For role-play edges (Participant Party or Thing plays a Role), use style { "strokeDasharray": "6 4" } and markerEnd { "type": "arrowclosed" }.
- For allowed cross-context Evidence As Role bridges, use style { "strokeDasharray": "3 3" } and no semantic shortcut that violates the bridge pattern.

Changes constraints:
- For a new or initial model, put every generated node in changes.addNodes and every generated edge in changes.addEdges; keep update/delete arrays empty.
- For an update to an existing model, return only the diff in changes. Use updateNodes/updateEdges for replacement payloads and deleteNodes/deleteEdges as id string arrays.
- addNodes ids and addEdges ids must be unique within the proposal and must not reuse ids from an existing model when one is provided.
- In one proposal, never repeat the same id across add/update/delete arrays for the same element type.
- If deleting a node, also include every incident edge id you know about in deleteEdges.
- If no executable change is available, return all six arrays empty and explain in summary.
"#;

fn build_prompt(requirement: &str) -> String {
    format!("{DOMAIN_ARCHITECT_PROMPT}\n\nUser requirement:\n{requirement}\n")
}

fn parse_modeling_proposal_value(value: Value) -> Result<ModelingProposal, ServerError> {
    serde_json::from_value(value).map_err(|error| {
        ServerError::Internal(format!("failed to parse pi rpc modeling proposal: {error}"))
    })
}

fn proposal_value_from_tool_result(result: &Value) -> Option<Value> {
    result
        .get("details")
        .and_then(|details| details.get("proposal"))
        .cloned()
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
    fn extracts_proposal_from_pi_tool_result_details() {
        let result = json!({
            "content": [{"type": "text", "text": "submitted"}],
            "details": {
                "proposal": {
                    "summary": "Create model",
                    "changes": {
                        "addNodes": [],
                        "updateNodes": [],
                        "deleteNodes": [],
                        "addEdges": [],
                        "updateEdges": [],
                        "deleteEdges": []
                    }
                }
            }
        });

        let proposal = parse_modeling_proposal_value(
            proposal_value_from_tool_result(&result).expect("proposal value"),
        )
        .unwrap();

        assert_eq!(proposal.summary, "Create model");
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
