import {
  canonicalStepRef,
  storyLineageSteps,
  type DomainModelDocument,
  type DomainStoryAST,
  type StoryStepAST,
} from '@evidence-poc/evidence-schema';
import { digestOf } from '../validation/modelDigest.js';
import type { FmCheckReport } from '../validation/fmCheck.js';
import type {
  FlowScenarioTrace,
  FlowStepTrace,
  StepFingerprintInput,
} from './types.js';

export const computeStepHash = ({
  entityId,
  entityKind,
  actorRef,
  activity,
  targetActorRef,
  asOf,
  basedOn,
  values,
  derivedAssertions,
  expectedStatus,
}: StepFingerprintInput): string =>
  digestOf({
    entityId,
    entityKind,
    actorRef,
    activity,
    targetActorRef,
    asOf,
    basedOn,
    values,
    derivedAssertions,
    expectedStatus,
  });
export interface ResolvedStoryStep extends StoryStepAST {
  storyId: string;
  ref: string;
  inherited: boolean;
}

function expand(
  stories: ReadonlyMap<string, DomainStoryAST>,
  id: string,
): ResolvedStoryStep[] {
  return storyLineageSteps(stories, id).map(({ storyId, step }, index) => ({
    ...structuredClone(step),
    storyId,
    ref: canonicalStepRef(storyId, step.id),
    inherited: storyId !== id,
    sequence: index + 1,
    basedOn: (step.basedOn ?? []).map((ref) => canonicalStepRef(storyId, ref)),
    ...(step.pathParameters && {
      pathParameters: Object.fromEntries(
        Object.entries(step.pathParameters).map(([key, source]) => [
          key,
          { ...source, stepRef: canonicalStepRef(storyId, source.stepRef) },
        ]),
      ),
    }),
  }));
}

export const resolveStorySteps = (
  model: DomainModelDocument,
  storyId: string,
) => expand(new Map(model.stories.map((story) => [story.id, story])), storyId);

const unique = (values: (string | undefined)[]): string[] =>
  [
    ...new Set(values.filter((value): value is string => value !== undefined)),
  ].sort();
export function resolveStoryTraces(
  model: DomainModelDocument,
  report?: Pick<FmCheckReport, 'gaps'>,
): FlowScenarioTrace[] {
  const stories = new Map(model.stories.map((story) => [story.id, story]));
  const entities = new Map(model.entities.map((entity) => [entity.id, entity]));
  const gapsBySubject = new Map<string, string[]>();
  for (const gap of report?.gaps ?? []) {
    const subject = gap.split(':', 1)[0];
    gapsBySubject.set(subject, [...(gapsBySubject.get(subject) ?? []), gap]);
  }
  return [...stories.keys()].sort().map((flowId) => {
    const story = stories.get(flowId)!;
    const steps = expand(stories, flowId).map((step): FlowStepTrace => {
      const entity = entities.get(step.workObjectRef);
      if (entity?.category !== 'evidence')
        throw new Error(
          `Unknown work object '${step.workObjectRef}' at '${step.ref}'`,
        );
      const input: StepFingerprintInput = {
        entityId: entity.id,
        entityKind: entity.kind,
        actorRef: step.actorRef,
        activity: step.activity,
        targetActorRef: step.targetActorRef,
        asOf: step.asOf,
        basedOn: step.basedOn,
        values: step.values,
        derivedAssertions: step.expect,
        expectedStatus: step.expectedStatus,
      };
      const subjects = unique([
        entity.id,
        entity.contextRef,
        ...(entity.attributes ?? []).map((a) => `${entity.id}.${a.name}`),
      ]);
      return {
        ...input,
        sequence: step.sequence,
        storyId: step.storyId,
        stepId: step.id,
        inherited: step.inherited,
        stepHash: computeStepHash(input),
        entityLabel: entity.label,
        contextRef: entity.contextRef,
        responsibleRoleRef: entity.responsibleRoleRef,
        description: step.description,
        gaps: unique(subjects.flatMap((key) => gapsBySubject.get(key) ?? [])),
      };
    });
    return {
      flowId,
      flowTitle: story.title,
      kind: story.kind,
      forkedFrom: story.forkedFrom,
      involvedContextRefs: unique(steps.map((s) => s.contextRef)),
      involvedRoleRefs: unique(
        steps.flatMap((s) => [
          s.actorRef,
          s.targetActorRef,
          s.responsibleRoleRef,
        ]),
      ),
      steps,
      traceDigest: digestOf(
        steps.map((s) => [s.storyId, s.stepId, s.stepHash]),
      ),
    };
  });
}
