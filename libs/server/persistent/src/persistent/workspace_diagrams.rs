use std::{path::PathBuf, sync::Arc};

use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::domain::{
    Diagram, DiagramDescription, HasOne, Ref, ServerError, Viewport, WorkspaceDiagram,
};

use super::{diagram_edges::DbDiagramEdges, diagram_nodes::DbDiagramNodes, store::DbStore};

const PROJECTED_DIAGRAM_ID: &str = "model";
const PROJECTED_DIAGRAM_TITLE: &str = "Model";

pub struct DbWorkspaceDiagram {
    store: DbStore,
    workspace_id: String,
    evidence_root: PathBuf,
}

impl DbWorkspaceDiagram {
    pub fn new(store: DbStore, workspace_id: String, evidence_root: PathBuf) -> Self {
        Self {
            store,
            workspace_id,
            evidence_root,
        }
    }

    fn projected_diagram(&self) -> Diagram {
        let diagram_id = PROJECTED_DIAGRAM_ID.to_string();
        Diagram::new(
            diagram_id.clone(),
            projected_description(&self.workspace_id, &self.evidence_root),
            Arc::new(DbDiagramNodes::new(
                self.store.clone(),
                diagram_id.clone(),
                self.evidence_root.clone(),
            )),
            Arc::new(DbDiagramEdges::new(
                self.store.clone(),
                diagram_id,
                self.evidence_root.clone(),
            )),
        )
    }
}

#[async_trait]
impl HasOne<Diagram> for DbWorkspaceDiagram {
    async fn get(&self) -> Result<Diagram, ServerError> {
        Ok(self.projected_diagram())
    }
}

impl WorkspaceDiagram for DbWorkspaceDiagram {}

fn projected_description(
    workspace_id: &str,
    evidence_root: &std::path::Path,
) -> DiagramDescription {
    let timestamp = file_timestamp(evidence_root);
    DiagramDescription {
        workspace: Ref::new(workspace_id.to_string()),
        title: PROJECTED_DIAGRAM_TITLE.to_string(),
        viewport: Viewport::default(),
        created_at: timestamp.clone(),
        updated_at: timestamp,
    }
}

fn file_timestamp(path: &std::path::Path) -> String {
    std::fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .map(|modified| DateTime::<Utc>::from(modified).to_rfc3339())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn projects_model_diagram_description_from_workspace() {
        let description =
            projected_description("workspace-1", &PathBuf::from("missing-evidence-root"));

        assert_eq!(description.workspace.id(), "workspace-1");
        assert_eq!(description.title, "Model");
    }
}
