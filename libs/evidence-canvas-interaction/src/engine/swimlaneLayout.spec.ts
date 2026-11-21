import { readFileSync } from 'node:fs';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import {
  computeSwimlaneLayout,
  rectContainsRect,
  type Point,
  type Rect,
} from '../index.js';
import { createFixtureDocument } from '../../tests/support/fixtureModel.js';

const crosses = (a: Point, b: Point, box: Rect) =>
  a.x === b.x
    ? a.x > box.x &&
      a.x < box.x + box.width &&
      Math.max(a.y, b.y) > box.y &&
      Math.min(a.y, b.y) < box.y + box.height
    : a.y > box.y &&
      a.y < box.y + box.height &&
      Math.max(a.x, b.x) > box.x &&
      Math.min(a.x, b.x) < box.x + box.width;

describe('responsibility swimlanes', () => {
  it('keeps every entity and local/world ownership without modifying the model', () => {
    const model = createFixtureDocument();
    const before = JSON.stringify(model);
    const graph = createDomainGraph(model);
    const a = computeSwimlaneLayout(graph);
    const b = computeSwimlaneLayout(graph);
    expect(a).toEqual(b);
    expect(JSON.stringify(model)).toBe(before);
    expect(a.nodes.length + a.contextGroups.length).toBe(model.entities.length);
    for (const node of a.nodes) {
      const parent = node.contextId
        ? a.contextGroupById.get(node.contextId)
        : undefined;
      expect(node.worldBox.x).toBe(node.box.x + (parent?.worldBox.x ?? 0));
      expect(
        rectContainsRect(parent?.worldBox ?? a.bounds, node.worldBox),
      ).toBe(true);
      const lane = a.swimlaneRegions?.find(
        (r) => r.kind === 'lane' && rectContainsRect(r.box, node.worldBox),
      );
      expect(lane).toBeDefined();
      if (node.entity.category === 'evidence' && node.entity.responsibleRoleRef)
        expect(lane?.label).toBe(
          graph.getEntity(node.entity.responsibleRoleRef)?.label,
        );
    }
    expect(a.edges.length).toBe(graph.relationships().length);
    for (const edge of [...a.edges, ...a.fulfillmentPairs]) {
      for (let i = 1; i < edge.points.length; i++) {
        expect(
          edge.points[i]!.x === edge.points[i - 1]!.x ||
            edge.points[i]!.y === edge.points[i - 1]!.y,
        ).toBe(true);
        for (const node of a.nodes)
          expect(
            crosses(edge.points[i - 1]!, edge.points[i]!, node.worldBox),
          ).toBe(false);
      }
    }
  });
  it.each(['simplified', 'standard', 'expanded'] as const)(
    'aligns four lifecycle stages and isolates remedy trunks at %s density',
    (viewMode) => {
      const model = JSON.parse(
        readFileSync(
          new URL(
            '../../../../examples/full-spectrum-procurement/model/full-spectrum-procurement.evidence.json',
            import.meta.url,
          ),
          'utf8',
        ),
      ) as DomainModelDocument;
      const graph = createDomainGraph(model);
      const layout = computeSwimlaneLayout(graph, viewMode);
      expect(layout.journeyMilestones?.map((m) => m.stage)).toEqual([
        'rfp',
        'proposal',
        'contract',
        'fulfillment',
      ]);
      for (const [id, stage] of Object.entries({
        'doc-sourcing-rfp': 'rfp',
        'doc-supplier-proposal': 'proposal',
        'doc-procurement-contract': 'contract',
        'req-advance-payment': 'fulfillment',
        'conf-advance-payment': 'fulfillment',
        'req-equipment-delivery': 'fulfillment',
        'conf-equipment-delivery': 'fulfillment',
        'doc-sgs-inspection-cert': 'fulfillment',
        'req-breach-penalty': 'fulfillment',
        'conf-breach-settlement': 'fulfillment',
        'req-escrow-release': 'fulfillment',
        'conf-escrow-release': 'fulfillment',
        'thing-tariff-calculator': 'fulfillment',
        'thing-compliance-checker': 'fulfillment',
      }))
        expect(layout.nodeById.get(id)?.journey?.stage, id).toBe(stage);
      for (const id of ['req-breach-penalty', 'conf-breach-settlement'])
        expect(layout.nodeById.get(id)?.journey?.corridor).toBe(
          'remedy_corridor',
        );
      const routeBand = layout.swimlaneRegions!.find((r) =>
        r.id.endsWith(':remedy-routing'),
      )!;
      const bottom = Math.max(
        ...layout.nodes.map((n) => n.worldBox.y + n.worldBox.height),
      );
      expect(routeBand.box.y).toBeGreaterThan(bottom);
      for (const edge of [...layout.edges, ...layout.fulfillmentPairs]) {
        for (let i = 1; i < edge.points.length; i++) {
          const a = edge.points[i - 1]!;
          const b = edge.points[i]!;
          expect(a.x === b.x || a.y === b.y).toBe(true);
          for (const node of layout.nodes)
            expect(
              crosses(a, b, node.worldBox),
              `${'relationshipId' in edge ? edge.relationshipId : edge.id} / ${node.nodeId}`,
            ).toBe(false);
        }
        if ('flowKind' in edge && edge.flowKind && edge.flowKind !== 'primary')
          expect(edge.points.some((p) => p.y >= routeBand.box.y)).toBe(true);
      }
      for (const node of layout.nodes) {
        const lane = layout.swimlaneRegions!.find(
          (r) =>
            r.kind === 'lane' &&
            r.contextId === node.contextId &&
            rectContainsRect(r.box, node.worldBox),
        );
        expect(lane).toBeDefined();
        if (node.journey?.roleId)
          expect(lane?.roleId).toBe(node.journey.roleId);
        const milestone = layout.journeyMilestones!.find(
          (m) => m.stage === node.journey?.stage,
        )!;
        expect(node.worldBox.x).toBeGreaterThanOrEqual(milestone.x);
        expect(node.worldBox.x + node.worldBox.width).toBeLessThanOrEqual(
          milestone.x + milestone.width,
        );
      }
      const reordered = structuredClone(model);
      reordered.entities.reverse();
      reordered.relationships.reverse();
      const other = computeSwimlaneLayout(
        createDomainGraph(reordered),
        viewMode,
      );
      for (const node of layout.nodes)
        expect(other.nodeById.get(node.nodeId)?.worldBox).toEqual(
          node.worldBox,
        );
      for (const edge of layout.edges)
        expect(other.edgeById.get(edge.relationshipId)?.points).toEqual(
          edge.points,
        );
    },
  );

  it('frames channel, contract and domain contexts in their lifecycle regions', () => {
    const model = createFixtureDocument();
    const contract = model.entities.find(
      (entity) => entity.id === 'context.product-procurement',
    );
    if (contract?.category !== 'context')
      throw new Error('Missing contract context');
    delete contract.parentContextRef;
    const layout = computeSwimlaneLayout(createDomainGraph(model));
    const frame = (ref: string) => layout.contextGroupById.get(ref)!.worldBox;
    const column = (stage: string) =>
      layout.journeyMilestones!.find((item) => item.stage === stage)!;
    const channel = frame('context.product-sourcing');
    const agreement = frame(contract.id);
    const domain = frame('context.product-catalog');
    expect(channel.x + channel.width).toBeLessThan(column('contract').x);
    expect(agreement.x).toBeGreaterThan(column('proposal').x);
    expect(agreement.x + agreement.width).toBeGreaterThan(
      column('fulfillment').x,
    );
    expect(domain.y).toBeGreaterThan(agreement.y + agreement.height);
    expect(domain.x).toBeGreaterThan(column('contract').x);
  });

  it('keeps anonymous requests and confirmations in the fulfillment stage in causal order', () => {
    const model = createFixtureDocument();
    const request = model.entities.find(
      (e) => e.id === 'evidence.delivery-request',
    )!;
    request.label = 'A';
    request.attributes = request.attributes?.filter(
      (a) => a.valueType === 'timestamp',
    );
    const confirmation = model.entities.find(
      (e) => e.id === 'evidence.delivery-confirmation',
    )!;
    const second = { ...request, id: 'anonymous', label: 'B' };
    model.entities.push(second);
    model.relationships.push({
      type: 'relationship',
      id: 'next',
      kind: 'references',
      sourceRef: second.id,
      targetRef: confirmation.id,
      label: '',
    });
    const layout = computeSwimlaneLayout(createDomainGraph(model));
    expect(layout.nodeById.get(request.id)?.journey?.stage).toBe('fulfillment');
    expect(layout.nodeById.get(second.id)?.journey?.stage).toBe('fulfillment');
    expect(layout.nodeById.get(request.id)!.worldBox.x).toBeLessThan(
      layout.nodeById.get(confirmation.id)!.worldBox.x,
    );
  });

  it('retains empty contexts and skips dangling relationships in a draft', () => {
    const model = createFixtureDocument();
    model.entities = model.entities.filter(
      (entity) => entity.category !== 'context',
    );
    model.entities.push({
      type: 'entity',
      category: 'context',
      id: 'empty',
      kind: 'domain',
      label: '空上下文',
    });
    model.relationships.push({
      type: 'relationship',
      id: 'dangling',
      kind: 'references',
      label: '',
      sourceRef: 'missing',
      targetRef: 'also-missing',
    });
    const layout = computeSwimlaneLayout(createDomainGraph(model));
    expect(layout.nodes.every((node) => node.contextId === null)).toBe(true);
    expect(layout.contextGroups.map((group) => group.contextId)).toEqual([
      'empty',
    ]);
    expect(layout.edgeById.has('dangling')).toBe(false);
  });

  it('places a shared confirmation once and routes each fulfillment link', () => {
    const model = createFixtureDocument();
    const request = model.entities.find(
      ({ id }) => id === 'evidence.delivery-request',
    )!;
    model.entities.push({ ...request, id: 'evidence.second-request' });
    model.relationships.push({
      type: 'relationship',
      id: 'relation.shared-result',
      kind: 'references',
      label: 'shared confirmation',
      sourceRef: 'evidence.delivery-confirmation',
      targetRef: 'evidence.second-request',
    });
    const layout = computeSwimlaneLayout(createDomainGraph(model));
    expect(
      layout.nodes.filter(
        ({ nodeId }) => nodeId === 'evidence.delivery-confirmation',
      ),
    ).toHaveLength(1);
    const pairs = layout.fulfillmentPairs.filter(
      ({ confirmationId }) =>
        confirmationId === 'evidence.delivery-confirmation',
    );
    expect(pairs.map(({ requestId }) => requestId)).toEqual([
      'evidence.delivery-request',
      'evidence.second-request',
    ]);
    expect(pairs.every(({ points }) => points.length >= 2)).toBe(true);
  });

  it('handles empty models and preserves cycle rejection', () => {
    const model = createFixtureDocument();
    model.entities = [];
    model.relationships = [];
    const empty = computeSwimlaneLayout(createDomainGraph(model));
    expect(empty.bounds.width).toBeGreaterThan(0);
    expect(empty.journeyMilestones).toHaveLength(4);
    const cyclic = createFixtureDocument();
    const context = cyclic.entities.find((e) => e.category === 'context')!;
    if (context.category === 'context') context.parentContextRef = context.id;
    expect(() => computeSwimlaneLayout(createDomainGraph(cyclic))).toThrow(
      'Cyclic Context',
    );
  });
});
