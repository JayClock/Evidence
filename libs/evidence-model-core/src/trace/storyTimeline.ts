import {
  timeAttributeOf,
  type DomainModelDocument,
  type RuleAST,
} from '@evidence-poc/evidence-schema';
import { evaluateRuleOnExample } from '../cel/transientSandbox.js';
import { createDomainGraph, type DomainGraph } from '../model/graph.js';
import { isTimestampText } from '../validation/typedValues.js';
import type { FlowScenarioTrace, FlowStepTrace } from './types.js';

const HOUR_MS = 3_600_000;
const REHEARSAL_START = Date.UTC(2000, 0, 1);
export const MAX_REHEARSAL_HOURS = 24 * 365;

export interface StoryTimelineMark {
  readonly time: number;
  readonly label: string;
  readonly kind: 'step' | 'deadline';
  readonly stepIndex?: number;
}

interface Observation {
  readonly key: string;
  readonly entityId: string;
  readonly time: number;
  readonly stepIndex?: number;
  readonly values: Readonly<Record<string, unknown>>;
}

export interface StoryTimeline {
  readonly kind: 'examples' | 'rehearsal';
  readonly start: number;
  readonly end: number;
  readonly marks: readonly StoryTimelineMark[];
  readonly at: (
    time: number,
    throughStepIndex?: number,
  ) => readonly TimelineObligation[];
}

export interface TimelineObligation {
  readonly key: string;
  readonly requestId: string;
  readonly label: string;
  readonly deadline?: number;
  readonly status: 'waiting' | 'completed' | 'overdue' | 'breached' | 'unknown';
  readonly triggeredRules: readonly { id: string; label: string }[];
  readonly unknownRules: readonly string[];
  readonly responses: readonly {
    id: string;
    entityId: string;
    label: string;
    kind: 'breach_compensation' | 'escalation';
  }[];
}

const clockField = (
  values: Observation['values'],
  field: string | undefined,
): number | undefined => {
  const value = field === undefined ? undefined : values[field];
  return isTimestampText(value) ? Date.parse(value) : undefined;
};

const refOf = ({ entityId, exampleLabel }: FlowStepTrace) =>
  `${entityId}#${exampleLabel}`;

const buildTimeline = (
  graph: DomainGraph,
  kind: StoryTimeline['kind'],
  observations: readonly Observation[],
  ancestors: ReadonlyMap<string, ReadonlySet<string>>,
  marks: StoryTimelineMark[],
): StoryTimeline => {
  const requests = observations.flatMap((observation) => {
    const pair = graph.fulfillmentPair(observation.entityId);
    if (!pair) return [];
    const start = clockField(
      observation.values,
      timeAttributeOf(pair.request, 'start')?.name,
    );
    const end = clockField(
      observation.values,
      timeAttributeOf(pair.request, 'deadline')?.name,
    );
    const deadline =
      start !== undefined && end !== undefined && start <= end
        ? end
        : undefined;
    if (deadline !== undefined && deadline >= observation.time)
      marks.push({
        time: deadline,
        label: `${pair.request.label}截止`,
        kind: 'deadline',
      });
    return [
      {
        observation,
        pair,
        start,
        deadline,
        confirmationIds: new Set(pair.confirmations.map(({ id }) => id)),
        outcomes: graph.breachOutcomesOf(observation.entityId),
      },
    ];
  });
  marks.sort((a, b) => a.time - b.time);
  const start = marks[0]!.time;
  const end = marks.reduce(
    (last, mark) =>
      Math.max(last, mark.time + (mark.kind === 'deadline' ? HOUR_MS : 0)),
    start,
  );
  return {
    kind,
    start,
    end,
    marks,
    at: (time, throughStepIndex) => {
      if (!Number.isFinite(time)) return [];
      time = Math.max(start, Math.min(end, Math.trunc(time)));
      // Explicit keyframes can distinguish causal events with the same clock value.
      const visible = observations.filter(
        (event) =>
          event.time <= time &&
          (throughStepIndex === undefined ||
            event.stepIndex === undefined ||
            event.stepIndex <= throughStepIndex),
      );
      const visibleKeys = new Set(visible.map(({ key }) => key));
      const visibleByEntity = new Map<string, Observation[]>();
      for (const event of visible) {
        const list = visibleByEntity.get(event.entityId) ?? [];
        list.push(event);
        visibleByEntity.set(event.entityId, list);
      }
      const asOf = new Date(time).toISOString();
      return requests.flatMap(
        ({ observation, pair, start, deadline, confirmationIds, outcomes }) => {
          if (
            !visibleKeys.has(observation.key) ||
            (start !== undefined && start > time)
          )
            return [];
          const upstream = ancestors.get(observation.key);
          const evaluate = (rule: RuleAST) => {
            const bindings: Record<string, unknown> = {};
            for (const [alias, binding] of Object.entries(rule.bindings)) {
              if ('type' in binding) continue;
              if (binding.ref === observation.entityId) {
                bindings[alias] =
                  binding.cardinality === 'many'
                    ? [observation.values]
                    : observation.values;
                continue;
              }
              const isConfirmation = confirmationIds.has(binding.ref);
              const candidates: Observation[] = [];
              for (const event of visibleByEntity.get(binding.ref) ?? []) {
                if (isConfirmation) {
                  const causal = ancestors.get(event.key);
                  const matching =
                    visibleByEntity
                      .get(observation.entityId)
                      ?.filter(({ key }) => causal?.has(key)) ?? [];
                  // Don't infer absence when a confirmation could belong to this instance.
                  if (
                    matching.length === 0 ||
                    (matching.length > 1 && matching.includes(observation))
                  )
                    return undefined;
                  if (matching.includes(observation)) candidates.push(event);
                } else if (upstream?.has(event.key)) candidates.push(event);
              }
              if (
                binding.cardinality === 'many' &&
                (isConfirmation || candidates.length > 0)
              )
                bindings[alias] = candidates.map(({ values }) => values);
              else if (
                binding.cardinality !== 'many' &&
                candidates.length === 1
              )
                bindings[alias] = candidates[0]!.values;
              else return undefined;
            }
            try {
              return evaluateRuleOnExample(graph.document, rule, {
                bindings,
                asOf,
              });
            } catch {
              return undefined;
            }
          };
          const completion = pair.completionRules.map(
            (rule) => [rule, evaluate(rule)] as const,
          );
          const breach = pair.breachRules.map(
            (rule) => [rule, evaluate(rule)] as const,
          );
          const triggeredRules = breach.flatMap(([rule, value]) =>
            value === true ? [{ id: rule.id, label: rule.label }] : [],
          );
          const unknownRules = [...completion, ...breach].flatMap(
            ([rule, value]) => (typeof value !== 'boolean' ? [rule.label] : []),
          );
          const status: TimelineObligation['status'] =
            triggeredRules.length > 0
              ? 'breached'
              : completion.some(([, value]) => value === true)
                ? 'completed'
                : deadline === undefined || unknownRules.length > 0
                  ? 'unknown'
                  : time > deadline
                    ? 'overdue'
                    : 'waiting';
          return [
            {
              key: observation.key,
              requestId: observation.entityId,
              label: pair.request.label,
              deadline,
              status,
              triggeredRules,
              unknownRules,
              // Edges are possible responses, never simulated events. They do not map individual rules to outcomes.
              responses:
                triggeredRules.length === 0
                  ? []
                  : outcomes.map((branch) => ({
                      id: branch.edge.id,
                      entityId: branch.edge.sourceRef,
                      label:
                        branch.kind === 'compensation_pair'
                          ? branch.compensation.request.label
                          : branch.handoff.label,
                      kind:
                        branch.kind === 'compensation_pair'
                          ? ('breach_compensation' as const)
                          : ('escalation' as const),
                    })),
            },
          ];
        },
      );
    },
  };
};

/** Preserve causal playback order. An inconsistent clock cannot drive a time axis. */
export const createScenarioTimeline = (
  document: DomainModelDocument,
  flow: FlowScenarioTrace,
): StoryTimeline | null => {
  const byRef = new Map<string, string>();
  const aliases = new Map<string, Set<string>>();
  const observations: Observation[] = [];
  const marks: StoryTimelineMark[] = [];
  const entities = new Map(
    document.entities.map((entity) => [entity.id, entity]),
  );
  const derivations = new Map<
    string,
    (RuleAST & { target: NonNullable<RuleAST['target']> })[]
  >();
  for (const rule of document.rules) {
    if (rule.kind !== 'derivation' || !rule.target) continue;
    const list = derivations.get(rule.target.entityRef) ?? [];
    list.push({ ...rule, target: rule.target });
    derivations.set(rule.target.entityRef, list);
  }
  for (const [index, step] of flow.steps.entries()) {
    const time = Date.parse(step.asOf);
    if (!Number.isFinite(time) || time < (marks.at(-1)?.time ?? -Infinity))
      return null;
    const key = refOf(step);
    byRef.set(key, key);
    for (const id of [step.values.id, step.values.ref]) {
      if (typeof id !== 'string' || !id) continue;
      const candidates = aliases.get(id) ?? new Set<string>();
      candidates.add(key);
      aliases.set(id, candidates);
    }
    const entity = entities.get(step.entityId);
    const expectedStatus = entity?.examples?.find(
      ({ label }) => label === step.exampleLabel,
    )?.test?.expectedStatus;
    // A rejected HTTP example is a playback step, not an observed business event.
    // Assertions and derived values are not evidence for the clock oracle.
    if ((expectedStatus ?? 200) < 400) {
      const values = { ...step.values };
      for (const { target } of derivations.get(step.entityId) ?? [])
        delete values[target.attribute];
      for (const attribute of entity?.attributes ?? []) {
        if (attribute.derivedByRuleRef) delete values[attribute.name];
      }
      observations.push({
        key,
        time,
        stepIndex: index,
        entityId: step.entityId,
        values,
      });
    }
    marks.push({
      time,
      label: step.entityLabel,
      kind: 'step',
      stepIndex: index,
    });
  }
  if (!marks.length) return null;
  const ancestors = new Map<string, ReadonlySet<string>>();
  for (const step of flow.steps) {
    const parents = new Set<string>();
    for (const ref of step.basedOn) {
      const candidates = aliases.get(ref);
      const key =
        byRef.get(ref) ??
        (candidates?.size === 1 ? [...candidates][0] : undefined);
      const inherited = key === undefined ? undefined : ancestors.get(key);
      if (key === undefined || inherited === undefined) return null;
      parents.add(key);
      for (const ancestor of inherited) parents.add(ancestor);
    }
    ancestors.set(refOf(step), parents);
  }
  const materialized = new Map<string, Observation>();
  const evaluated = observations.map((observation) => {
    const values = { ...observation.values };
    const upstream = [...(ancestors.get(observation.key) ?? [])].flatMap(
      (key) => materialized.get(key) ?? [],
    );
    let pending = derivations.get(observation.entityId) ?? [];
    while (pending.length > 0) {
      const remaining = pending.filter((rule) => {
        const bindings: Record<string, unknown> = {};
        for (const [alias, binding] of Object.entries(rule.bindings)) {
          if ('type' in binding) continue;
          const matches =
            binding.ref === observation.entityId
              ? [values]
              : upstream
                  .filter(({ entityId }) => entityId === binding.ref)
                  .map((event) => event.values);
          if (binding.cardinality === 'many') bindings[alias] = matches;
          else if (matches.length === 1) bindings[alias] = matches[0];
          else return true;
        }
        try {
          values[rule.target.attribute] = evaluateRuleOnExample(
            document,
            rule,
            {
              bindings,
              asOf: new Date(observation.time).toISOString(),
            },
          );
          return false;
        } catch {
          return true;
        }
      });
      if (remaining.length === pending.length) break;
      pending = remaining;
    }
    const result = { ...observation, values };
    materialized.set(result.key, result);
    return result;
  });
  return buildTimeline(
    createDomainGraph(document),
    'examples',
    evaluated,
    ancestors,
    marks,
  );
};

/** Rehearse one modeled request with an explicit elapsed-hours assumption and no confirmation. */
export const createRequestRehearsal = (
  document: DomainModelDocument,
  requestId: string,
  windowHours: number,
): StoryTimeline | null => {
  const graph = createDomainGraph(document);
  const request = graph.fulfillmentPair(requestId)?.request;
  if (
    !request ||
    !Number.isSafeInteger(windowHours) ||
    windowHours <= 0 ||
    windowHours > MAX_REHEARSAL_HOURS
  )
    return null;
  const startField = timeAttributeOf(request, 'start');
  const deadlineField = timeAttributeOf(request, 'deadline');
  if (!startField || !deadlineField) return null;
  const deadline = REHEARSAL_START + windowHours * HOUR_MS;
  return buildTimeline(
    graph,
    'rehearsal',
    [
      {
        key: requestId,
        time: REHEARSAL_START,
        entityId: requestId,
        values: {
          [startField.name]: new Date(REHEARSAL_START).toISOString(),
          [deadlineField.name]: new Date(deadline).toISOString(),
        },
      },
    ],
    new Map(),
    [
      {
        time: REHEARSAL_START,
        label: `${request.label}（假设发起）`,
        kind: 'step',
      },
    ],
  );
};
