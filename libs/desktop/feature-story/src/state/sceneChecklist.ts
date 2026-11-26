import type { StoryScene } from '@evidence-poc/evidence-agent/browser';
import type {
  DomainGraph,
  FlowScenarioTrace,
} from '@evidence-poc/evidence-model-core';
import {
  classifyKeyDataSource,
  isContractContext,
  KEY_DATA_SOURCE_LABELS,
} from '@evidence-poc/evidence-schema';

/** Inspect the same model revision used to project this step, including gaps in its example. */
export function sceneChecklist(
  graph: DomainGraph,
  flow: FlowScenarioTrace,
  scene: StoryScene,
) {
  const entity = graph.getEntity(scene.activity.workObject.entityId);
  const context =
    entity && 'contextRef' in entity && entity.contextRef
      ? graph.getEntity(entity.contextRef)
      : undefined;
  const fields = new Map(
    scene.documentCard.keyAttributes.map((field) => [field.name, field]),
  );
  if (entity) {
    for (const attribute of entity.attributes ?? []) {
      if (!attribute.keyData) continue;
      const field = fields.get(attribute.name);
      const { source, derivedByRuleRef } = attribute;
      let origin: string =
        KEY_DATA_SOURCE_LABELS[classifyKeyDataSource(entity, attribute)];
      if (derivedByRuleRef)
        origin = graph.getRule(derivedByRuleRef)?.label ?? '派生规则待核对';
      else if (source && 'entityRef' in source) {
        const provider = graph.getEntity(source.entityRef);
        const input = graph.attribute(source.entityRef, source.attribute);
        origin =
          provider && input
            ? `《${provider.label}》 · ${input.label}`
            : '引用字段待核对';
      }
      fields.set(attribute.name, {
        name: attribute.name,
        label: attribute.label,
        value: field?.value ?? '示例未提供',
        sourceOrigin: origin,
      });
    }
  }
  const requests = (scene.activity.fulfillment?.requests ?? []).flatMap(
    (facts) => {
      const step = flow.steps.find(
        ({ sequence }) => sequence === facts.stepIndex,
      );
      const pair = step && graph.fulfillmentPair(step.entityId);
      if (!pair) return [];
      const subjects = [
        pair.request,
        ...pair.confirmations,
        ...pair.proofs,
      ].flatMap(({ id }) =>
        graph.subjectMattersOf(id).map(({ label }) => label),
      );
      return [
        {
          stepIndex: facts.stepIndex,
          action: facts.action,
          rightHolder: facts.rightHolder?.roleLabel,
          obligor: facts.obligor?.roleLabel,
          id: pair.request.id,
          label: pair.request.label,
          subjectMatters: [...new Set(subjects)],
          completionRules: pair.completionRules.map(({ label }) => label),
        },
      ];
    },
  );
  return {
    contractContext: isContractContext(context) ? context.label : undefined,
    requests,
    keyData: [...fields.values()],
  };
}

export type SceneChecklist = ReturnType<typeof sceneChecklist>;
