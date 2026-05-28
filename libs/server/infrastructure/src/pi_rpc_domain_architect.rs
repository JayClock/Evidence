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
        let mut assistant_text = String::new();

        while let Some(event) = stream.next().await {
            if let ModelingEvent::TextChunk { chunk } = event? {
                assistant_text.push_str(&chunk);
            }
        }

        parse_modeling_proposal(&assistant_text)
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
            let mut emitted_text = false;
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
                        let assistant_event = event
                            .get("assistantMessageEvent")
                            .unwrap_or(&Value::Null);
                        match assistant_event.get("type").and_then(Value::as_str) {
                            Some("text_delta") => {
                                if let Some(delta) = assistant_event.get("delta").and_then(Value::as_str) {
                                    assistant_text.push_str(delta);
                                    emitted_text = true;
                                    yield ModelingEvent::TextChunk { chunk: delta.to_string() };
                                    yield ModelingEvent::StructuredChunk {
                                        kind: "diagram-model".to_string(),
                                        format: "json".to_string(),
                                        chunk: delta.to_string(),
                                    };
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
                                let tool_call_id = tool_call_id(assistant_event);
                                let tool_name = tool_name(assistant_event);
                                yield ModelingEvent::ToolCallStarted { tool_call_id, tool_name };
                            }
                            Some("toolcall_delta") => {
                                if let Some(delta) = assistant_event.get("delta").and_then(Value::as_str) {
                                    let tool_call_id = tool_call_id(assistant_event);
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
                                    let tool_call_id = tool_call
                                        .get("id")
                                        .and_then(Value::as_str)
                                        .map(str::to_string)
                                        .unwrap_or_else(|| tool_call_id(assistant_event));
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
                            tool_call_id: event_string(&event, "toolCallId", "tool-call"),
                            tool_name: event_string(&event, "toolName", "tool"),
                            args: event.get("args").cloned().unwrap_or(Value::Null),
                        };
                    }
                    Some("tool_execution_update") => {
                        yield ModelingEvent::ToolExecutionUpdated {
                            tool_call_id: event_string(&event, "toolCallId", "tool-call"),
                            tool_name: event_string(&event, "toolName", "tool"),
                            args: event.get("args").cloned().unwrap_or(Value::Null),
                            partial_result: event.get("partialResult").cloned().unwrap_or(Value::Null),
                        };
                    }
                    Some("tool_execution_end") => {
                        yield ModelingEvent::ToolExecutionEnded {
                            tool_call_id: event_string(&event, "toolCallId", "tool-call"),
                            tool_name: event_string(&event, "toolName", "tool"),
                            result: event.get("result").cloned().unwrap_or(Value::Null),
                            is_error: event.get("isError").and_then(Value::as_bool).unwrap_or(false),
                        };
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

            let _proposal = parse_modeling_proposal(&assistant_text)?;

            if !emitted_text {
                yield ModelingEvent::TextChunk {
                    chunk: assistant_text.clone(),
                };
                yield ModelingEvent::StructuredChunk {
                    kind: "diagram-model".to_string(),
                    format: "json".to_string(),
                    chunk: assistant_text,
                };
            }
        })
    }
}

const DOMAIN_ARCHITECT_PROMPT: &str = r#"You are the Evidence Domain Architect.

Task:
- Propose Fulfillment Modeling (FM) diagram-modeling changes for the user's requirement.
- Stream exactly one JSON object and no markdown prose.
- The first non-whitespace character must be `{` and the last non-whitespace character must be `}`.
- Do not wrap the JSON in markdown fences, labels, commentary, explanations, logs, or any prefix/suffix text.
- Do not emit more than one top-level JSON value. Stop immediately after the closing `}`.
- Do not modify files, call tools, or execute commands.
- Return only the FM changes payload below; do not return an operations array.

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

Output JSON shape:
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

fn parse_modeling_proposal(text: &str) -> Result<ModelingProposal, ServerError> {
    let candidate = json_candidate(text).ok_or_else(|| {
        ServerError::Internal("pi rpc response did not contain a JSON object".to_string())
    })?;

    let mut value: Value = serde_json::from_str(candidate).map_err(|error| {
        ServerError::Internal(format!("failed to parse pi rpc modeling proposal: {error}"))
    })?;
    normalize_modeling_proposal(&mut value)?;

    serde_json::from_value(value).map_err(|error| {
        ServerError::Internal(format!("failed to parse pi rpc modeling proposal: {error}"))
    })
}

fn normalize_modeling_proposal(value: &mut Value) -> Result<(), ServerError> {
    let Some(changes) = value.get_mut("changes").and_then(Value::as_object_mut) else {
        return Ok(());
    };

    for collection in ["addNodes", "updateNodes"] {
        let Some(nodes) = changes.get_mut(collection).and_then(Value::as_array_mut) else {
            continue;
        };

        for (index, node) in nodes.iter_mut().enumerate() {
            normalize_node_entity_type(node, collection, index)?;
        }
    }

    Ok(())
}

fn normalize_node_entity_type(
    node: &mut Value,
    collection: &str,
    index: usize,
) -> Result<(), ServerError> {
    let node_id = node
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("<missing id>")
        .to_string();
    let node_kind = node.get("kind").and_then(Value::as_str).map(str::to_string);
    let Some(data) = node.get_mut("data").and_then(Value::as_object_mut) else {
        return Ok(());
    };
    let Some(Value::String(entity_type)) = data.get("type") else {
        return Ok(());
    };

    if !is_enum_placeholder(entity_type) {
        return Ok(());
    }

    let Some(inferred) = infer_entity_type(data, node_kind.as_deref(), &node_id) else {
        Err(ServerError::Internal(format!(
            "failed to parse pi rpc modeling proposal: {collection}[{index}] ({node_id}) data.type copied the enum placeholder; expected one concrete type: EVIDENCE, PARTICIPANT, ROLE, or CONTEXT"
        )))?
    };

    data.insert("type".to_string(), Value::String(inferred.to_string()));
    Ok(())
}

fn is_enum_placeholder(value: &str) -> bool {
    let upper = value.to_ascii_uppercase();
    upper.contains('|')
        && ["EVIDENCE", "PARTICIPANT", "ROLE", "CONTEXT"]
            .iter()
            .filter(|variant| upper.contains(**variant))
            .count()
            > 1
}

fn infer_entity_type(
    data: &serde_json::Map<String, Value>,
    node_kind: Option<&str>,
    node_id: &str,
) -> Option<&'static str> {
    if node_kind == Some("group-container") {
        return Some("CONTEXT");
    }

    let sub_type = data.get("subType")?.as_str()?.trim();
    if let Some((prefix, _)) = sub_type.split_once(':') {
        return match prefix.trim().to_ascii_uppercase().as_str() {
            "EVIDENCE" => Some("EVIDENCE"),
            "PARTICIPANT" => Some("PARTICIPANT"),
            "ROLE" => Some("ROLE"),
            "CONTEXT" => Some("CONTEXT"),
            _ => None,
        };
    }

    match sub_type.to_ascii_lowercase().as_str() {
        "rfp"
        | "proposal"
        | "contract"
        | "fulfillment_request"
        | "fulfillment_confirmation"
        | "other_evidence" => Some("EVIDENCE"),
        "thing" => Some("PARTICIPANT"),
        "domain" | "3rd system" | "context" | "evidence" => Some("ROLE"),
        "bounded_context" => Some("CONTEXT"),
        "party" => infer_party_entity_type(data, node_id),
        _ => None,
    }
}

fn infer_party_entity_type(
    data: &serde_json::Map<String, Value>,
    node_id: &str,
) -> Option<&'static str> {
    let name = data.get("name").and_then(Value::as_str).unwrap_or_default();
    let label = data
        .get("label")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let searchable = format!("{node_id} {name} {label}").to_ascii_lowercase();

    if searchable.contains("role") || searchable.contains("角色") {
        Some("ROLE")
    } else {
        Some("PARTICIPANT")
    }
}

fn tool_call_id(assistant_event: &Value) -> String {
    assistant_event
        .get("toolCall")
        .and_then(|tool_call| tool_call.get("id"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| {
            let content_index = assistant_event
                .get("contentIndex")
                .and_then(Value::as_u64)
                .unwrap_or(0);
            format!("tool-call-{content_index}")
        })
}

fn tool_name(assistant_event: &Value) -> Option<String> {
    assistant_event
        .get("toolCall")
        .and_then(|tool_call| tool_call.get("name"))
        .and_then(Value::as_str)
        .or_else(|| assistant_event.get("toolName").and_then(Value::as_str))
        .map(str::to_string)
}

fn event_string(event: &Value, key: &str, fallback: &str) -> String {
    event
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or(fallback)
        .to_string()
}

fn json_candidate(text: &str) -> Option<&str> {
    let trimmed = text.trim();

    if let Some(start) = trimmed.find("```json") {
        let after_marker = &trimmed[start + "```json".len()..];
        if let Some(end) = after_marker.find("```") {
            return first_complete_json_object(after_marker[..end].trim());
        }
    }

    if let Some(start) = trimmed.find("```") {
        let after_marker = &trimmed[start + "```".len()..];
        if let Some(end) = after_marker.find("```") {
            return first_complete_json_object(after_marker[..end].trim());
        }
    }

    first_complete_json_object(trimmed)
}

fn first_complete_json_object(text: &str) -> Option<&str> {
    let trimmed = text.trim();
    let start = trimmed.find('{')?;
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;

    for (offset, ch) in trimmed[start..].char_indices() {
        if in_string {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }

        match ch {
            '"' => in_string = true,
            '{' => depth += 1,
            '}' => {
                depth = depth.checked_sub(1)?;
                if depth == 0 {
                    let end = start + offset + ch.len_utf8();
                    return Some(trimmed[start..end].trim());
                }
            }
            _ => {}
        }
    }

    None
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
            r#"{"summary":"Create model","changes":{"addNodes":[],"updateNodes":[],"deleteNodes":[],"addEdges":[],"updateEdges":[],"deleteEdges":[]}}"#,
        )
        .unwrap();

        assert_eq!(proposal.summary, "Create model");
        assert!(proposal.changes.add_nodes.is_empty());
    }

    #[test]
    fn parses_fenced_json_proposal() {
        let proposal = parse_modeling_proposal(
            r#"Here is the proposal:
```json
{"summary":"Ask follow-up","changes":{"addNodes":[],"updateNodes":[],"deleteNodes":[],"addEdges":[],"updateEdges":[],"deleteEdges":[]}}
```
"#,
        )
        .unwrap();

        assert_eq!(proposal.summary, "Ask follow-up");
    }

    #[test]
    fn parses_first_complete_json_object_when_response_has_trailing_text() {
        let proposal = parse_modeling_proposal(
            r#"{"summary":"Create model","changes":{"addNodes":[],"updateNodes":[],"deleteNodes":[],"addEdges":[],"updateEdges":[],"deleteEdges":[]}}

Note: I have returned the proposal above."#,
        )
        .unwrap();

        assert_eq!(proposal.summary, "Create model");
    }

    #[test]
    fn parses_first_complete_json_object_when_response_repeats_json() {
        let proposal = parse_modeling_proposal(
            r#"{"summary":"First proposal","changes":{"addNodes":[],"updateNodes":[],"deleteNodes":[],"addEdges":[],"updateEdges":[],"deleteEdges":[]}}
{"summary":"Duplicate proposal","changes":{"addNodes":[],"updateNodes":[],"deleteNodes":[],"addEdges":[],"updateEdges":[],"deleteEdges":[]}}"#,
        )
        .unwrap();

        assert_eq!(proposal.summary, "First proposal");
    }

    #[test]
    fn rejects_legacy_operations_proposal() {
        let error = parse_modeling_proposal(
            r#"{
              "summary": {"message": "Add contract", "addNodes": 1},
              "operations": [{"type": "ADD_NODE"}]
            }"#,
        )
        .unwrap_err();

        assert!(error
            .to_string()
            .contains("failed to parse pi rpc modeling proposal"));
    }

    #[test]
    fn parses_public_node_and_edge_change_fields() {
        let proposal = parse_modeling_proposal(
            r#"{
              "summary": "Add fulfillment flow",
              "changes": {
                "addNodes": [
                  {
                    "id": "node-1",
                    "kind": "fulfillment-node",
                    "parent": {"id": "node-context-1"},
                    "position": {"x": 0, "y": 0},
                    "width": null,
                    "height": null,
                    "data": {
                      "name": "SalesContract",
                      "label": "销售合同",
                      "type": "EVIDENCE",
                      "subType": "contract",
                      "attributes": [{"name": "signedAt", "valueType": "DateTime", "required": true}]
                    }
                  }
                ],
                "updateNodes": [],
                "deleteNodes": [],
                "addEdges": [
                  {
                    "id": "edge-1",
                    "source": {"id": "node-1"},
                    "target": {"id": "node-2"},
                    "kind": "smoothstep",
                    "relationType": "evidence_flow",
                    "label": "合同触发履约",
                    "style": {},
                    "data": {"sourceRelation": "1", "targetRelation": "1"},
                    "animated": false,
                    "hidden": false,
                    "markerStart": null,
                    "markerEnd": {"type": "arrowclosed"},
                    "pathOptions": {},
                    "interactionWidth": null
                  }
                ],
                "updateEdges": [],
                "deleteEdges": []
              }
            }"#,
        )
        .unwrap();

        let node = &proposal.changes.add_nodes[0];
        assert_eq!(node.kind.as_deref(), Some("fulfillment-node"));
        assert!(node.data.extra.contains_key("attributes"));

        let edge = &proposal.changes.add_edges[0];
        assert_eq!(edge.id.as_deref(), Some("edge-1"));
        assert_eq!(edge.kind.as_deref(), Some("smoothstep"));
        assert_eq!(edge.data["sourceRelation"], "1");
    }

    #[test]
    fn repairs_placeholder_entity_type_from_sub_type() {
        let proposal = parse_modeling_proposal(
            r#"{
              "summary": "Add fulfillment flow",
              "changes": {
                "addNodes": [
                  {
                    "id": "node-contract",
                    "kind": "fulfillment-node",
                    "parent": null,
                    "position": {"x": 0, "y": 0},
                    "width": null,
                    "height": null,
                    "data": {
                      "name": "SalesContract",
                      "label": "销售合同",
                      "type": "EVIDENCE | PARTICIPANT | ROLE | CONTEXT",
                      "subType": "contract",
                      "attributes": []
                    }
                  },
                  {
                    "id": "node-buyer-role",
                    "kind": "fulfillment-node",
                    "parent": null,
                    "position": {"x": 0, "y": 0},
                    "width": null,
                    "height": null,
                    "data": {
                      "name": "BuyerRole",
                      "label": "买方角色",
                      "type": "EVIDENCE | PARTICIPANT | ROLE | CONTEXT",
                      "subType": "party",
                      "attributes": []
                    }
                  }
                ],
                "updateNodes": [],
                "deleteNodes": [],
                "addEdges": [],
                "updateEdges": [],
                "deleteEdges": []
              }
            }"#,
        )
        .unwrap();

        assert_eq!(
            proposal.changes.add_nodes[0].data.entity_type,
            evidence_server_domain::LogicalEntityType::Evidence
        );
        assert_eq!(
            proposal.changes.add_nodes[1].data.entity_type,
            evidence_server_domain::LogicalEntityType::Role
        );
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
