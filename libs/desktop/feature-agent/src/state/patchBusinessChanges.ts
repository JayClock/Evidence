import {
  createDomainGraph,
  type ModelDiff,
} from '@evidence-poc/evidence-model-core';
import type {
  DomainModelDocument,
  RelationshipAST,
} from '@evidence-poc/evidence-schema';

export const PATCH_BUSINESS_LABELS = {
  fulfillment: '关联履约请求与确认',
  channelResponse: '关联询价与报价',
  subjectMatter: '关联交付标的物',
  compensation: '挂载违约补偿',
  escalation: '记录争议升级',
  terminalRemedy: '记录救济终点',
  evidenceSocket: '关联履约能力插槽',
  story: '更新领域故事',
} as const;

export type PatchBusinessChange = keyof typeof PATCH_BUSINESS_LABELS;

/** Describe the relationships and stories changed by a model patch. */
export const describeBusinessChanges = (
  diff: ModelDiff,
  document: DomainModelDocument,
): readonly PatchBusinessChange[] => {
  const graph = createDomainGraph(document);
  const classify = (edge: RelationshipAST): PatchBusinessChange | undefined => {
    const source = graph.getEntity(edge.sourceRef);
    const target = graph.getEntity(edge.targetRef);
    if (edge.kind === 'plays_role') {
      return source?.category === 'evidence' &&
        target?.category === 'role' &&
        target.kind === 'evidence'
        ? 'evidenceSocket'
        : undefined;
    }
    if (edge.flowKind === 'breach_compensation') return 'compensation';
    if (edge.flowKind === 'escalation') {
      return edge.terminalRemedyKind === undefined
        ? 'escalation'
        : 'terminalRemedy';
    }
    if (source?.category !== 'evidence') return undefined;
    if (target?.category === 'participant' && target.kind === 'thing')
      return 'subjectMatter';
    if (target?.category === 'role' && target.kind === 'evidence')
      return 'evidenceSocket';
    if (target?.category !== 'evidence') return undefined;
    if (
      source.kind === 'fulfillment_confirmation' &&
      target.kind === 'fulfillment_request'
    )
      return 'fulfillment';
    if (source.kind === 'proposal' && target.kind === 'rfp')
      return 'channelResponse';
    return undefined;
  };

  const changes = new Set<PatchBusinessChange>();
  if (diff.stories.some((story) => story.changeType !== 'unchanged'))
    changes.add('story');
  for (const { changeType, base, target, fields } of diff.relationships) {
    if (target === undefined) continue;
    const introduced =
      changeType === 'added' ||
      (changeType === 'modified' &&
        (fields?.some(
          (field) =>
            field === 'kind' ||
            field === 'flowKind' ||
            field === 'sourceRef' ||
            field === 'targetRef',
        ) ||
          (base?.terminalRemedyKind === undefined &&
            target.terminalRemedyKind !== undefined)));
    if (!introduced) continue;
    const kind = classify(target);
    if (kind !== undefined) changes.add(kind);
  }
  return [...changes];
};
