import type { RefinementCtx } from 'zod';
import type { DomainModelDocument } from './document.js';
import { HTTP_VALUE_SCHEMAS } from './httpValues.js';
import type { StoryStepAST } from './story.js';
import {
  canonicalStepRef,
  storyLineageSteps,
  type OwnedStoryStep,
} from './storyLineage.js';
import type { ValidationCode } from '../validation/errors.js';

export function validateStories(
  document: DomainModelDocument,
  ctx: RefinementCtx,
): void {
  const stories = new Map(document.stories.map((story) => [story.id, story]));
  const entities = new Map(
    document.entities.map((entity) => [entity.id, entity]),
  );
  const rules = new Map(document.rules.map((rule) => [rule.id, rule]));
  for (const [position, story] of document.stories.entries()) {
    const report = (
      code: ValidationCode,
      path: (string | number)[],
      message: string,
    ) =>
      ctx.addIssue({
        code: 'custom',
        path: ['stories', position, ...path],
        message,
        params: { validationCode: code, objectId: story.id },
      });
    const trigger = story.forkedFrom?.triggerRuleRef;
    if (
      trigger &&
      !['breach', 'completion'].includes(rules.get(trigger)?.kind ?? '')
    )
      report(
        'story.fork',
        ['forkedFrom', 'triggerRuleRef'],
        `expected a breach or completion rule at '${trigger}'`,
      );
    let lineage: OwnedStoryStep[];
    try {
      lineage = storyLineageSteps(stories, story.id);
    } catch (error) {
      report('story.fork', ['forkedFrom'], String(error));
      continue;
    }
    const preceding = new Map<string, StoryStepAST>();
    for (const { storyId, step } of lineage) {
      if (storyId === story.id) {
        const path = ['steps', story.steps.indexOf(step)];
        for (const field of ['actorRef', 'targetActorRef'] as const) {
          const role = step[field];
          if (role && entities.get(role)?.category !== 'role')
            report(
              'story.reference',
              [...path, field],
              `expected a role at '${role}'`,
            );
        }
        const entity = entities.get(step.workObjectRef);
        if (entity?.category !== 'evidence')
          report(
            'story.reference',
            [...path, 'workObjectRef'],
            `expected evidence at '${step.workObjectRef}'`,
          );
        else
          for (const [name, value] of Object.entries(step.values)) {
            const attribute = entity.attributes?.find(
              (item) => item.name === name,
            );
            if (
              !attribute ||
              !HTTP_VALUE_SCHEMAS[attribute.valueType ?? 'dynamic'].safeParse(
                value,
              ).success
            )
              report(
                'story.value',
                [...path, 'values', name],
                `unknown or invalid attribute '${entity.id}.${name}'`,
              );
          }
        const check = (ref: string, location: (string | number)[]) => {
          const source = preceding.get(canonicalStepRef(storyId, ref));
          if (
            !source ||
            (source.expectedStatus ?? 200) >= 400 ||
            Date.parse(source.asOf) > Date.parse(step.asOf)
          )
            report(
              'story.dependency',
              [...path, ...location],
              `'${ref}' must reference a preceding successful step at or before this business clock`,
            );
        };
        step.basedOn.forEach((ref, i) => check(ref, ['basedOn', i]));
        for (const [name, source] of Object.entries(step.pathParameters ?? {}))
          check(source.stepRef, ['pathParameters', name, 'stepRef']);
      }
      preceding.set(canonicalStepRef(storyId, step.id), step);
    }
  }
}
