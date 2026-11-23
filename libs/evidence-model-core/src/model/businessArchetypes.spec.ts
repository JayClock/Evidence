import { describe, expect, it } from 'vitest';
import {
  createEmptyDomainModel,
  DomainModelDocumentSchema,
  type InstantiateArchetypeInput,
} from '@evidence-poc/evidence-schema';
import { createModelSession } from '../session/createModelSession.js';
import { createDomainGraph } from './graph.js';
import {
  instantiateArchetypeMutator,
  listBusinessArchetypes,
} from './businessArchetypes.js';
import { deriveContextMapGraph } from './contextMap.js';

const config: InstantiateArchetypeInput['variationValues'] = {
  subjectLabel: '服务 {{not-a-template}}',
  customerLabel: '客户',
  operatorLabel: '平台',
  providerLabel: '服务方',
};

describe('business archetypes', () => {
  it.each(listBusinessArchetypes())(
    'validates $id and allows independent copies',
    ({ id }) => {
      const model = createEmptyDomainModel();
      for (const idPrefix of ['alpha', 'beta', 'gamma']) {
        instantiateArchetypeMutator(model, {
          archetypeId: id,
          idPrefix,
          variationValues: config,
        });
      }
      expect(DomainModelDocumentSchema.safeParse(model).success).toBe(true);
      expect(model.manifest.entryContextRefs).toEqual([
        'alpha.core.context',
        'beta.core.context',
        'gamma.core.context',
      ]);
      const graph = createDomainGraph(model);
      expect(graph.fulfillmentPairs()).toHaveLength(9);
      expect(graph.preContractPairs()).toHaveLength(
        id === 'matching-escrow' ? 3 : 0,
      );
      expect(graph.getEntity('beta.subject.thing')?.label).toBe(
        config.subjectLabel,
      );
      const map = deriveContextMapGraph(graph);
      expect(map.edges).toContainEqual(
        expect.objectContaining({
          kind: 'capability',
          sourceRef: 'beta.core.context',
          targetRef: 'beta.support.context',
          socketRefs: ['beta.support.socket'],
        }),
      );
      expect(map.edges).toContainEqual(
        expect.objectContaining({
          kind: 'domain',
          targetRef: 'beta.subject.context',
        }),
      );
      expect(model.rules).toHaveLength(0);
      expect(model.relationships.some((edge) => edge.terminalRemedyKind)).toBe(
        false,
      );
    },
  );

  it('rejects collisions without changing the document; supports undo as one edit', () => {
    const input = {
      archetypeId: 'matching-escrow',
      idPrefix: 'one',
      variationValues: config,
    } as const;
    const session = createModelSession({ document: createEmptyDomainModel() });
    const before = session.getDocument();
    session.mutate((draft) => instantiateArchetypeMutator(draft, input));
    const applied = session.getDocument();
    const current = structuredClone(applied);
    expect(() => instantiateArchetypeMutator(current, input)).toThrow(
      '实例前缀',
    );
    expect(current).toEqual(applied);
    expect(session.undo()).toBe(true);
    expect(session.getDocument()).toEqual(before);
  });

  it('keeps direct dependencies distinct from socket bindings and shows unbound slots', () => {
    const model = createEmptyDomainModel();
    instantiateArchetypeMutator(model, {
      archetypeId: 'matching-escrow',
      idPrefix: 'one',
      variationValues: config,
    });
    model.entities.push({
      type: 'entity',
      category: 'role',
      kind: 'evidence',
      id: 'one.unbound',
      label: '备用能力',
      contextRef: 'one.core.context',
    });
    model.relationships.push({
      type: 'relationship',
      kind: 'references',
      id: 'one.direct-dependency',
      label: '审计依据',
      sourceRef: 'one.delivery.confirmation',
      targetRef: 'one.external.confirmation',
    });
    const map = deriveContextMapGraph(createDomainGraph(model));
    expect(
      map.edges.filter((edge) => edge.targetRef === 'one.support.context'),
    ).toMatchObject([
      { kind: 'capability', socketRefs: ['one.support.socket'] },
      {
        kind: 'evidence',
        originRefs: ['one.direct-dependency'],
        socketRefs: [],
      },
    ]);
    expect(map.edges).toContainEqual(
      expect.objectContaining({
        kind: 'channel',
        targetRef: 'one.channel.context',
      }),
    );
    expect(
      map.clusters.find(({ id }) => id === 'one.core.context')?.sockets,
    ).toContainEqual({
      id: 'one.unbound',
      label: '备用能力',
      providerRefs: [],
    });
  });

  it('uses explicit window and remedy without inventing automatic breach rules', () => {
    const model = createEmptyDomainModel();
    instantiateArchetypeMutator(model, {
      archetypeId: 'periodic-subscription',
      idPrefix: 'one',
      variationValues: {
        ...config,
        fulfillmentWindow: '3 个工作日',
        remedy: { kind: 'arbitration', condition: '未在约定时限开通' },
      },
    });
    const graph = createDomainGraph(model);
    expect(graph.attribute('one.delivery.request', 'expired_at')?.meaning).toBe(
      '3 个工作日',
    );
    expect(graph.breachOutcomesOf('one.delivery.request')).toMatchObject([
      { kind: 'terminal_escalation', remedyKind: 'arbitration' },
    ]);
    expect(model.rules.filter(({ kind }) => kind === 'breach')).toHaveLength(0);
  });
});
