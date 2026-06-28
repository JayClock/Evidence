import { HasMany } from '../core';
import { Diagram, DiagramDescription } from './diagram';
import { DraftEdge, DraftNode } from './types';

export interface WorkspaceDiagrams extends HasMany<Diagram> {
  add(desc: DiagramDescription): Promise<Diagram>;
  update(diagramId: string, desc: DiagramDescription): Promise<Diagram>;
  delete(diagramId: string): Promise<void>;
  list(page: number, pageSize: number): Promise<[Diagram[], number]>;
  saveDiagram(
    diagramId: string,
    draftNodes: DraftNode[],
    draftEdges: DraftEdge[],
  ): Promise<void>;
}
