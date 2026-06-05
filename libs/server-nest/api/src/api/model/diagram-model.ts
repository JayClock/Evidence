import { Diagram } from '@evidence/server-nest-domain';
import {
  link,
  Link,
  workspaceDiagramCommitDraftHref,
  workspaceDiagramEdgesHref,
  workspaceDiagramHref,
  workspaceDiagramNodesHref,
  workspaceDiagramProposeModelHref,
  workspaceDiagramPublishHref,
  workspaceDiagramsHref,
  workspaceDiagramVersionsHref,
} from '../links';

export interface DiagramModel {
  _links: Record<string, Link>;
  _templates: Record<string, unknown>;
  id: string;
  title: string;
  type: string;
  status: string;
  viewport: ReturnType<Diagram['description']>['viewport'];
  createdAt: string;
  updatedAt: string;
}

export function diagramModel(diagram: Diagram): DiagramModel {
  const diagramId = diagram.identity();
  const description = diagram.description();
  const workspaceId = description.workspace.id();
  return {
    _links: {
      self: link(workspaceDiagramHref(workspaceId, diagramId)),
      workspace: link(`/api/workspaces/${workspaceId}`),
      collection: link(workspaceDiagramsHref(workspaceId)),
      nodes: link(workspaceDiagramNodesHref(workspaceId, diagramId)),
      edges: link(workspaceDiagramEdgesHref(workspaceId, diagramId)),
      versions: link(workspaceDiagramVersionsHref(workspaceId, diagramId)),
      'commit-draft': link(
        workspaceDiagramCommitDraftHref(workspaceId, diagramId),
      ),
      'propose-model': link(
        workspaceDiagramProposeModelHref(workspaceId, diagramId),
      ),
      publish: link(workspaceDiagramPublishHref(workspaceId, diagramId)),
    },
    _templates: {
      'propose-model': proposeModelTemplate(workspaceId, diagramId),
    },
    id: diagramId,
    title: description.title,
    type: description.type,
    status: description.status,
    viewport: description.viewport,
    createdAt: description.createdAt,
    updatedAt: description.updatedAt,
  };
}

function proposeModelTemplate(workspaceId: string, diagramId: string): unknown {
  return {
    title: 'Propose diagram model',
    method: 'POST',
    target: workspaceDiagramProposeModelHref(workspaceId, diagramId),
    contentType: 'application/json',
    properties: [
      {
        name: 'requirement',
        prompt: 'Requirement',
        type: 'textarea',
        required: true,
        minLength: 1,
      },
    ],
  };
}
