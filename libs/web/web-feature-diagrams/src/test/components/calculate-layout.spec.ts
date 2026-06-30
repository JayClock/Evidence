import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  calculateLayout,
  CONTEXT_LAYOUT_PADDING_X,
  CONTEXT_LAYOUT_PADDING_Y,
  LAYOUT_NODE_HEIGHT,
  LAYOUT_NODE_WIDTH,
} from '../../lib/components/calculate-layout';
import type { DiagramNodeData } from '../../lib/components/diagram-types';
import edges from '../fixture/edges.json' with { type: 'json' };
import nodes from '../fixture/nodes.json' with { type: 'json' };

type LNode = Node<DiagramNodeData>;
type LEdge = Pick<
  Edge,
  'data' | 'hidden' | 'id' | 'label' | 'source' | 'target'
>;

const CONTRACT_ID = 'node-2';
const CONTRACT_CONTEXT_ID = 'node-1';
const LOGISTICS_CONTEXT_ID = 'node-11';
const PAYMENT_CONTEXT_ID = 'node-19';
const REQUEST_1_ID = 'node-5';
const CONFIRMATION_1_ID = 'node-6';
const DEFAULT_CONTEXT_NODE_WIDTH = 420;
const DEFAULT_CONTEXT_NODE_HEIGHT = 280;
const FIXTURE_NODES = nodes as LNode[];
const FIXTURE_EDGES = edges as LEdge[];

function toNodeMap(list: LNode[]): Map<string, LNode> {
  return new Map(list.map((node) => [node.id, node] as const));
}

function requireNode(nodeMap: Map<string, LNode>, nodeId: string): LNode {
  const node = nodeMap.get(nodeId);
  expect(node).toBeDefined();
  return node as LNode;
}

function testNode(
  id: string,
  type: string,
  subType: string | null,
  label: string,
): LNode {
  return {
    id,
    type: 'fulfillment-node',
    position: { x: 0, y: 0 },
    width: LAYOUT_NODE_WIDTH,
    height: LAYOUT_NODE_HEIGHT,
    data: {
      id,
      type,
      subType,
      name: label,
      label,
      definition: {},
    },
  };
}

describe('calculateLayout - ELK layered layout', () => {
  it('sizes context containers from their children instead of default dimensions', async () => {
    const layoutedNodes = await calculateLayout(
      [
        {
          id: 'context',
          type: 'group-container',
          position: { x: 0, y: 0 },
          width: DEFAULT_CONTEXT_NODE_WIDTH,
          height: DEFAULT_CONTEXT_NODE_HEIGHT,
          data: {
            id: 'context',
            type: 'CONTEXT',
            name: 'Context',
            label: 'Context',
            definition: {},
          },
        },
        {
          id: 'child',
          type: 'fulfillment-node',
          parentId: 'context',
          position: { x: 0, y: 0 },
          width: LAYOUT_NODE_WIDTH,
          height: LAYOUT_NODE_HEIGHT,
          data: {
            id: 'child',
            type: 'EVIDENCE',
            name: 'Child',
            label: 'Child',
            definition: {},
          },
        },
      ],
      [],
    );
    const context = requireNode(toNodeMap(layoutedNodes), 'context');

    expect(context.width).toBe(
      CONTEXT_LAYOUT_PADDING_X * 2 + LAYOUT_NODE_WIDTH,
    );
    expect(context.height).toBe(
      CONTEXT_LAYOUT_PADDING_Y * 2 + LAYOUT_NODE_HEIGHT,
    );
  });

  it('centers thing layout on the evidence-linked thing and ignores reference edges', async () => {
    const layoutedNodes = await calculateLayout(
      [
        testNode(
          'workspace_evidence',
          'EVIDENCE',
          'contract',
          'Workspace Evidence',
        ),
        testNode('workspace', 'PARTICIPANT', 'thing', 'Workspace'),
        testNode('diagram', 'PARTICIPANT', 'thing', 'Diagram'),
        testNode('logical_entity', 'PARTICIPANT', 'thing', 'LogicalEntity'),
        testNode(
          'logical_relationship',
          'PARTICIPANT',
          'thing',
          'LogicalRelationship',
        ),
        testNode('diagram_node', 'PARTICIPANT', 'thing', 'DiagramNode'),
        testNode('diagram_edge', 'PARTICIPANT', 'thing', 'DiagramEdge'),
      ],
      [
        {
          id: 'evidence-to-workspace',
          source: 'workspace_evidence',
          target: 'workspace',
        },
        {
          id: 'workspace-has-diagram',
          source: 'workspace',
          target: 'diagram',
        },
        {
          id: 'workspace-has-logical-entities',
          source: 'workspace',
          target: 'logical_entity',
        },
        {
          id: 'workspace-has-logical-relationships',
          source: 'workspace',
          target: 'logical_relationship',
        },
        {
          id: 'diagram-has-nodes',
          source: 'diagram',
          target: 'diagram_node',
        },
        {
          id: 'diagram-has-edges',
          source: 'diagram',
          target: 'diagram_edge',
        },
        {
          id: 'diagram-node-references-logical-entity',
          source: 'diagram_node',
          target: 'logical_entity',
        },
        {
          id: 'diagram-edge-references-logical-relationship',
          source: 'diagram_edge',
          target: 'logical_relationship',
        },
      ],
    );
    const nodeMap = toNodeMap(layoutedNodes);
    const workspaceEvidence = requireNode(nodeMap, 'workspace_evidence');
    const workspace = requireNode(nodeMap, 'workspace');
    const diagram = requireNode(nodeMap, 'diagram');
    const logicalEntity = requireNode(nodeMap, 'logical_entity');
    const logicalRelationship = requireNode(nodeMap, 'logical_relationship');
    const diagramNode = requireNode(nodeMap, 'diagram_node');
    const diagramEdge = requireNode(nodeMap, 'diagram_edge');

    expect(workspace.position.x).toBeGreaterThan(workspaceEvidence.position.x);
    expect(diagram.position.x).toBeGreaterThan(workspace.position.x);
    expect(logicalEntity.position.x).toBeGreaterThan(workspace.position.x);
    expect(logicalRelationship.position.x).toBeGreaterThan(
      workspace.position.x,
    );
    expect(diagramNode.position.x).toBeGreaterThan(diagram.position.x);
    expect(diagramEdge.position.x).toBeGreaterThan(diagram.position.x);
    expect(logicalEntity.position.x).toBeLessThan(diagramNode.position.x);
    expect(logicalRelationship.position.x).toBeLessThan(diagramEdge.position.x);
  });

  it('places fulfillment evidence along a left-to-right chain', async () => {
    const layoutedNodes = await calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    const contract = requireNode(nodeMap, CONTRACT_ID);
    const request = requireNode(nodeMap, REQUEST_1_ID);
    const confirmation = requireNode(nodeMap, CONFIRMATION_1_ID);

    expect(request.position.x).toBeGreaterThan(contract.position.x);
    expect(confirmation.position.x).toBeGreaterThan(request.position.x);
  });

  it('uses a contract spine, fulfillment lanes, and a shared participant pool', async () => {
    const layoutedNodes = await calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    const contract = requireNode(nodeMap, CONTRACT_ID);
    const request = requireNode(nodeMap, REQUEST_1_ID);
    const confirmation = requireNode(nodeMap, CONFIRMATION_1_ID);
    const buyerRole = requireNode(nodeMap, 'node-3');
    const sellerRole = requireNode(nodeMap, 'node-4');
    const deliveryConfirmation = requireNode(nodeMap, 'node-8');
    const deliveryEvidence = requireNode(nodeMap, 'node-9');
    const thing = requireNode(nodeMap, 'node-31');
    const paymentLane = requireNode(
      nodeMap,
      `__evidence-fulfillment-lane-${REQUEST_1_ID}`,
    );
    const deliveryLane = requireNode(
      nodeMap,
      '__evidence-fulfillment-lane-node-7',
    );
    const sharedPool = requireNode(
      nodeMap,
      `__evidence-shared-pool-${CONTRACT_CONTEXT_ID}`,
    );

    expect(contract.parentId).toBe(CONTRACT_CONTEXT_ID);
    expect(paymentLane.parentId).toBe(CONTRACT_CONTEXT_ID);
    expect(deliveryLane.parentId).toBe(CONTRACT_CONTEXT_ID);
    expect(sharedPool.parentId).toBe(CONTRACT_CONTEXT_ID);
    expect(request.parentId).toBe(paymentLane.id);
    expect(confirmation.parentId).toBe(paymentLane.id);
    expect(buyerRole.parentId).toBe(paymentLane.id);
    expect(sellerRole.parentId).toBe(deliveryLane.id);
    expect(deliveryConfirmation.parentId).toBe(deliveryLane.id);
    expect(deliveryEvidence.parentId).toBe(deliveryLane.id);
    expect(thing.parentId).toBe(sharedPool.id);
    expect(paymentLane.position.x).toBeGreaterThan(contract.position.x);
    expect(deliveryLane.position.y).toBeGreaterThan(paymentLane.position.y);
    expect(deliveryEvidence.position.y).toBeGreaterThan(
      deliveryConfirmation.position.y,
    );
    expect(deliveryEvidence.position.x).not.toBe(
      deliveryConfirmation.position.x,
    );
  });

  it('synthesizes pre-contract and contract contexts when saved groups are absent', async () => {
    const layoutedNodes = await calculateLayout(
      [
        testNode('rfp', 'EVIDENCE', 'rfp', 'RFP'),
        testNode('proposal', 'EVIDENCE', 'proposal', 'Proposal'),
        testNode('contract', 'EVIDENCE', 'contract', 'Contract'),
        testNode(
          'request',
          'EVIDENCE',
          'fulfillment_request',
          'Fulfillment Request',
        ),
        testNode(
          'confirmation',
          'EVIDENCE',
          'fulfillment_confirmation',
          'Fulfillment Confirmation',
        ),
        testNode('role', 'ROLE', 'party', 'Role'),
        testNode('party', 'PARTICIPANT', 'party', 'Party'),
        testNode('thing', 'PARTICIPANT', 'thing', 'Thing'),
      ],
      [
        { id: 'rfp-to-proposal', source: 'rfp', target: 'proposal' },
        { id: 'proposal-to-contract', source: 'proposal', target: 'contract' },
        { id: 'contract-to-request', source: 'contract', target: 'request' },
        {
          id: 'request-to-confirmation',
          source: 'request',
          target: 'confirmation',
        },
        { id: 'contract-to-role', source: 'contract', target: 'role' },
        { id: 'role-to-party', source: 'role', target: 'party' },
        { id: 'contract-to-thing', source: 'contract', target: 'thing' },
      ],
    );
    const preContext = layoutedNodes.find(
      (node) => node.data.label === '合约前上下文',
    );
    const contractContext = layoutedNodes.find(
      (node) => node.data.label === '合约的上下文',
    );
    const nodeMap = toNodeMap(layoutedNodes);
    const rfp = requireNode(nodeMap, 'rfp');
    const contract = requireNode(nodeMap, 'contract');
    const request = requireNode(nodeMap, 'request');
    const confirmation = requireNode(nodeMap, 'confirmation');
    const role = requireNode(nodeMap, 'role');
    const party = requireNode(nodeMap, 'party');
    const thing = requireNode(nodeMap, 'thing');

    expect(preContext).toBeDefined();
    expect(contractContext).toBeDefined();
    expect(contractContext?.position.x).toBeGreaterThan(
      preContext?.position.x ?? 0,
    );
    const lane = layoutedNodes.find(
      (node) => node.id === '__evidence-fulfillment-lane-request',
    );
    const sharedPool = layoutedNodes.find(
      (node) => node.id === `__evidence-shared-pool-${contractContext?.id}`,
    );

    expect(lane).toBeDefined();
    expect(sharedPool).toBeDefined();
    expect(rfp.parentId).toBe(preContext?.id);
    expect(contract.parentId).toBe(contractContext?.id);
    expect(request.parentId).toBe(lane?.id);
    expect(confirmation.parentId).toBe(lane?.id);
    expect(role.parentId).toBe(sharedPool?.id);
    expect(party.parentId).toBe(sharedPool?.id);
    expect(thing.parentId).toBe(sharedPool?.id);
    expect(confirmation.position.x).toBeGreaterThan(request.position.x);
    expect(lane?.position.x ?? 0).toBeGreaterThan(contract.position.x);
  });

  it('keeps parent context nodes before their children for React Flow', async () => {
    const layoutedNodes = await calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const contextIndex = layoutedNodes.findIndex(
      (node) => node.id === CONTRACT_CONTEXT_ID,
    );
    const contractIndex = layoutedNodes.findIndex(
      (node) => node.id === CONTRACT_ID,
    );

    expect(contextIndex).toBeGreaterThanOrEqual(0);
    expect(contractIndex).toBeGreaterThanOrEqual(0);
    expect(contextIndex).toBeLessThan(contractIndex);
  });

  it('expands compound context nodes around their children', async () => {
    const layoutedNodes = await calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    const context = requireNode(nodeMap, CONTRACT_CONTEXT_ID);
    const contextChildren = layoutedNodes.filter(
      (node) => node.parentId === CONTRACT_CONTEXT_ID,
    );

    expect(context.width).toBeGreaterThan(LAYOUT_NODE_WIDTH);
    expect(context.height).toBeGreaterThan(LAYOUT_NODE_HEIGHT);

    for (const child of contextChildren) {
      expect(child.position.x).toBeGreaterThanOrEqual(0);
      expect(child.position.y).toBeGreaterThanOrEqual(0);
      expect(
        child.position.x + (child.width ?? LAYOUT_NODE_WIDTH),
      ).toBeLessThanOrEqual(context.width ?? 0);
      expect(
        child.position.y + (child.height ?? LAYOUT_NODE_HEIGHT),
      ).toBeLessThanOrEqual(context.height ?? 0);
    }
  });

  it('lays out multiple contexts without overlap', async () => {
    const layoutedNodes = await calculateLayout(FIXTURE_NODES, FIXTURE_EDGES);
    const nodeMap = toNodeMap(layoutedNodes);
    const contractContext = requireNode(nodeMap, CONTRACT_CONTEXT_ID);
    const logisticsContext = requireNode(nodeMap, LOGISTICS_CONTEXT_ID);
    const paymentContext = requireNode(nodeMap, PAYMENT_CONTEXT_ID);

    const contextBounds = [contractContext, logisticsContext, paymentContext]
      .map((node) => ({
        id: node.id,
        left: node.position.x,
        right: node.position.x + (node.width ?? 0),
        top: node.position.y,
        bottom: node.position.y + (node.height ?? 0),
      }))
      .sort((left, right) => left.left - right.left);

    for (let index = 1; index < contextBounds.length; index += 1) {
      const previous = contextBounds[index - 1];
      const current = contextBounds[index];
      const horizontallySeparate = current.left >= previous.right;
      const verticallySeparate =
        current.top >= previous.bottom || current.bottom <= previous.top;

      expect(horizontallySeparate || verticallySeparate).toBe(true);
    }
  });
});
