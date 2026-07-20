import { stat } from 'node:fs/promises';
import {
  defaultViewport,
  Diagram,
  Ref,
  WorkspaceDiagram,
} from '@evidence/server-domain';
import { FileDiagramEdges } from './diagram-edges';
import { FileDiagramNodes } from './diagram-nodes';

const PROJECTED_DIAGRAM_ID = 'model';
const PROJECTED_DIAGRAM_TITLE = 'Model';

export class FileWorkspaceDiagram implements WorkspaceDiagram {
  constructor(
    private readonly workspaceId: string,
    private readonly evidenceRoot: string,
  ) {}

  async get(): Promise<Diagram> {
    const timestamp = await fileTimestamp(this.evidenceRoot);
    return new Diagram(
      PROJECTED_DIAGRAM_ID,
      {
        workspace: new Ref(this.workspaceId),
        title: PROJECTED_DIAGRAM_TITLE,
        viewport: defaultViewport(),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      new FileDiagramNodes(PROJECTED_DIAGRAM_ID, this.evidenceRoot),
      new FileDiagramEdges(PROJECTED_DIAGRAM_ID, this.evidenceRoot),
    );
  }
}

async function fileTimestamp(path: string): Promise<string> {
  try {
    return (await stat(path)).mtime.toISOString();
  } catch {
    return '';
  }
}
