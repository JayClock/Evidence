use serde::{Deserialize, Serialize};

use super::{EdgeDescription, NodeDescription};
use crate::domain::ServerError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Viewport {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}

impl Default for Viewport {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            zoom: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DiagramType {
    Flowchart,
    Sequence,
    Class,
    Component,
    State,
    Activity,
    Fulfillment,
}

impl DiagramType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Flowchart => "flowchart",
            Self::Sequence => "sequence",
            Self::Class => "class",
            Self::Component => "component",
            Self::State => "state",
            Self::Activity => "activity",
            Self::Fulfillment => "fulfillment",
        }
    }
}

impl TryFrom<&str> for DiagramType {
    type Error = ServerError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "flowchart" => Ok(Self::Flowchart),
            "sequence" => Ok(Self::Sequence),
            "class" => Ok(Self::Class),
            "component" => Ok(Self::Component),
            "state" => Ok(Self::State),
            "activity" => Ok(Self::Activity),
            "fulfillment" => Ok(Self::Fulfillment),
            other => Err(ServerError::Validation(format!(
                "unknown diagram type: {other}"
            ))),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DiagramStatus {
    Draft,
    Published,
}

impl DiagramStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::Published => "published",
        }
    }
}

impl TryFrom<&str> for DiagramStatus {
    type Error = ServerError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "draft" => Ok(Self::Draft),
            "published" => Ok(Self::Published),
            other => Err(ServerError::Validation(format!(
                "unknown diagram status: {other}"
            ))),
        }
    }
}

#[derive(Debug, Clone)]
pub struct DraftNode {
    pub id: String,
    pub description: NodeDescription,
}

#[derive(Debug, Clone)]
pub struct DraftEdge {
    pub id: Option<String>,
    pub description: EdgeDescription,
}
