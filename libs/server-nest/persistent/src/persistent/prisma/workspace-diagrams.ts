import { stat } from 'node:fs/promises';
import {
  defaultViewport,
  Diagram,
  Ref,
  WorkspaceDiagram,
} from '@evidence/server-nest-domain';
import { PrismaDiagramEdges } from './diagram-edges';
import { PrismaDiagramNodes } from './diagram-nodes';
import type { PrismaStore } from './types';

const PROJECTED_DIAGRAM_ID = 'model';
const PROJECTED_DIAGRAM_TITLE = 'Model';

export class PrismaWorkspaceDiagram implements WorkspaceDiagram {
  constructor(
    private readonly store: PrismaStore,
    private readonly workspaceId: string,
    private readonly evidenceRoot = '.evidence',
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
      new PrismaDiagramNodes(this.store, PROJECTED_DIAGRAM_ID),
      new PrismaDiagramEdges(this.store, PROJECTED_DIAGRAM_ID),
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
