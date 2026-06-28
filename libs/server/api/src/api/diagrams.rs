use axum::{
    extract::{Path, State},
    response::sse::{Event, Sse},
    routing::get,
    Json, Router,
};
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::domain::{Diagram, DiagramEdge, DiagramNode, ModelingEvent, ServerError, Workspace};

use super::{
    error::ApiError,
    links::Link,
    model::{diagram_model, edge_model, node_model, DiagramModel, EdgeModel, NodeModel},
    AppState,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProposeModelInput {
    requirement: String,
}

async fn load_workspace(state: &AppState, workspace_id: &str) -> Result<Workspace, ServerError> {
    state
        .users
        .workspaces()
        .find_by_identity(workspace_id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("workspace {workspace_id} not found")))
}

async fn load_diagram(
    state: &AppState,
    workspace_id: &str,
) -> Result<(Workspace, Diagram), ApiError> {
    let workspace = load_workspace(state, workspace_id).await?;
    let diagram = workspace.diagram().get().await?;
    Ok((workspace, diagram))
}

async fn get_diagram(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let (_, diagram) = load_diagram(&state, &workspace_id).await?;
    Ok(Json(diagram_resource(&diagram)))
}

async fn list_nodes(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let (workspace, diagram) = load_diagram(&state, &workspace_id).await?;
    let nodes = diagram.nodes().find_all(0, usize::MAX).await?;
    Ok(Json(
        node_collection_resource(&workspace, &diagram, &nodes).await?,
    ))
}

async fn get_node(
    State(state): State<AppState>,
    Path((workspace_id, node_id)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    let (workspace, diagram) = load_diagram(&state, &workspace_id).await?;
    let node = diagram
        .nodes()
        .find_by_identity(&node_id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("diagram node {node_id} not found")))?;
    Ok(Json(node_resource(&workspace, &node).await?))
}

async fn list_edges(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let (_, diagram) = load_diagram(&state, &workspace_id).await?;
    let edges = diagram.edges().find_all(0, usize::MAX).await?;
    Ok(Json(edge_collection_resource(
        &workspace_id,
        &diagram,
        &edges,
    )))
}

async fn get_edge(
    State(state): State<AppState>,
    Path((workspace_id, edge_id)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    let (_, diagram) = load_diagram(&state, &workspace_id).await?;
    let edge = diagram
        .edges()
        .find_by_identity(&edge_id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("diagram edge {edge_id} not found")))?;
    Ok(Json(edge_resource(&workspace_id, &edge)))
}

async fn propose_model(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
    Json(input): Json<ProposeModelInput>,
) -> Result<Sse<impl futures_util::Stream<Item = Result<Event, std::convert::Infallible>>>, ApiError>
{
    if input.requirement.trim().is_empty() {
        return Err(ServerError::Validation("requirement is required".to_string()).into());
    }

    load_diagram(&state, &workspace_id).await?;
    let mut events = state
        .domain_architect
        .propose_model_stream(input.requirement);

    let stream = async_stream::stream! {
        let mut had_error = false;
        let mut completed = false;

        while let Some(event) = events.next().await {
            match event {
                Ok(ModelingEvent::TextChunk { chunk }) => {
                    yield Ok(Event::default().data(chunk));
                }
                Ok(ModelingEvent::ReasoningStarted) => {
                    yield Ok(Event::default().event("thinking-start").data(""));
                }
                Ok(ModelingEvent::ReasoningChunk { chunk }) => {
                    yield Ok(Event::default().event("thinking").data(chunk));
                }
                Ok(ModelingEvent::ReasoningEnded) => {
                    yield Ok(Event::default().event("thinking-end").data(""));
                }
                Ok(ModelingEvent::ToolCallStarted { tool_call_id, tool_name }) => {
                    match serde_json::to_string(&json!({ "toolCallId": tool_call_id, "toolName": tool_name })) {
                        Ok(data) => yield Ok(Event::default().event("tool-call-start").data(data)),
                        Err(error) => yield Ok(Event::default().event("error").data(format!("failed to serialize tool call start: {error}"))),
                    }
                }
                Ok(ModelingEvent::ToolCallDelta { tool_call_id, tool_name, chunk }) => {
                    match serde_json::to_string(&json!({ "toolCallId": tool_call_id, "toolName": tool_name, "chunk": chunk })) {
                        Ok(data) => yield Ok(Event::default().event("tool-call-delta").data(data)),
                        Err(error) => yield Ok(Event::default().event("error").data(format!("failed to serialize tool call delta: {error}"))),
                    }
                }
                Ok(ModelingEvent::ToolCallReady { tool_call_id, tool_name, input }) => {
                    match serde_json::to_string(&json!({ "toolCallId": tool_call_id, "toolName": tool_name, "input": input })) {
                        Ok(data) => yield Ok(Event::default().event("tool-call").data(data)),
                        Err(error) => yield Ok(Event::default().event("error").data(format!("failed to serialize tool call: {error}"))),
                    }
                }
                Ok(ModelingEvent::ToolExecutionStarted { tool_call_id, tool_name, args }) => {
                    match serde_json::to_string(&json!({ "toolCallId": tool_call_id, "toolName": tool_name, "args": args })) {
                        Ok(data) => yield Ok(Event::default().event("tool-execution-start").data(data)),
                        Err(error) => yield Ok(Event::default().event("error").data(format!("failed to serialize tool execution start: {error}"))),
                    }
                }
                Ok(ModelingEvent::ToolExecutionUpdated { tool_call_id, tool_name, args, partial_result }) => {
                    match serde_json::to_string(&json!({ "toolCallId": tool_call_id, "toolName": tool_name, "args": args, "partialResult": partial_result })) {
                        Ok(data) => yield Ok(Event::default().event("tool-execution-update").data(data)),
                        Err(error) => yield Ok(Event::default().event("error").data(format!("failed to serialize tool execution update: {error}"))),
                    }
                }
                Ok(ModelingEvent::ToolExecutionEnded { tool_call_id, tool_name, result, is_error }) => {
                    match serde_json::to_string(&json!({ "toolCallId": tool_call_id, "toolName": tool_name, "result": result, "isError": is_error })) {
                        Ok(data) => yield Ok(Event::default().event("tool-execution-end").data(data)),
                        Err(error) => yield Ok(Event::default().event("error").data(format!("failed to serialize tool execution end: {error}"))),
                    }
                }
                Ok(ModelingEvent::MessageEnded) => {
                    yield Ok(Event::default().event("message-end").data(""));
                }
                Ok(ModelingEvent::AgentEnded) => {
                    yield Ok(Event::default().event("agent-end").data(""));
                }
                Ok(ModelingEvent::Completed) => {
                    completed = true;
                    yield Ok(Event::default().event("complete").data(""));
                }
                Err(error) => {
                    had_error = true;
                    yield Ok(Event::default().event("error").data(error.to_string()));
                    break;
                }
            }
        }

        if !had_error && !completed {
            yield Ok(Event::default().event("complete").data(""));
        }
    };

    Ok(Sse::new(stream))
}

pub(super) fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/workspaces/{workspaceId}/diagram", get(get_diagram))
        .route(
            "/api/workspaces/{workspaceId}/diagram/nodes",
            get(list_nodes),
        )
        .route(
            "/api/workspaces/{workspaceId}/diagram/nodes/{nodeId}",
            get(get_node),
        )
        .route(
            "/api/workspaces/{workspaceId}/diagram/edges",
            get(list_edges),
        )
        .route(
            "/api/workspaces/{workspaceId}/diagram/edges/{edgeId}",
            get(get_edge),
        )
        .route(
            "/api/workspaces/{workspaceId}/diagram/propose-model",
            get(get_diagram).post(propose_model),
        )
}

fn diagram_href(workspace_id: &str) -> String {
    format!("/api/workspaces/{workspace_id}/diagram")
}

fn diagram_resource(diagram: &Diagram) -> Value {
    let model: DiagramModel = diagram_model(diagram);
    serde_json::to_value(model).expect("diagram model should serialize")
}

async fn node_resources(
    workspace: &Workspace,
    nodes: &[DiagramNode],
) -> Result<Vec<Value>, ApiError> {
    let mut resources = Vec::with_capacity(nodes.len());
    for node in nodes {
        resources.push(node_resource(workspace, node).await?);
    }
    Ok(resources)
}

async fn node_resource(workspace: &Workspace, node: &DiagramNode) -> Result<Value, ApiError> {
    let logical_entity = match &node.description().logical_entity {
        Some(logical_entity) => {
            workspace
                .logical_entities()
                .find_by_identity(logical_entity.id())
                .await?
        }
        None => None,
    };
    let model: NodeModel = node_model(workspace.identity(), node, logical_entity.as_ref());
    Ok(serde_json::to_value(model).expect("node model should serialize"))
}

fn edge_resource(workspace_id: &str, edge: &DiagramEdge) -> Value {
    let model: EdgeModel = edge_model(workspace_id, edge);
    serde_json::to_value(model).expect("edge model should serialize")
}

async fn node_collection_resource(
    workspace: &Workspace,
    _diagram: &Diagram,
    nodes: &[DiagramNode],
) -> Result<Value, ApiError> {
    let workspace_id = workspace.identity();
    Ok(json!({
        "_links": {
            "self": Link::new(format!("/api/workspaces/{workspace_id}/diagram/nodes")),
            "diagram": Link::new(diagram_href(workspace_id)),
        },
        "_embedded": {
            "nodes": node_resources(workspace, nodes).await?,
        }
    }))
}

fn edge_collection_resource(
    workspace_id: &str,
    _diagram: &Diagram,
    edges: &[DiagramEdge],
) -> Value {
    json!({
        "_links": {
            "self": Link::new(format!("/api/workspaces/{workspace_id}/diagram/edges")),
            "diagram": Link::new(diagram_href(workspace_id)),
        },
        "_embedded": {
            "edges": edges.iter().map(|edge| edge_resource(workspace_id, edge)).collect::<Vec<_>>(),
        }
    })
}
