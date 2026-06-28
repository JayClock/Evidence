use serde::{Deserialize, Serialize};

use super::{EdgeDescription, NodeDescription};

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

impl Default for Position {
    fn default() -> Self {
        Self { x: 0.0, y: 0.0 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DraftNode {
    pub id: String,
    pub description: NodeDescription,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DraftEdge {
    pub id: Option<String>,
    pub description: EdgeDescription,
}
