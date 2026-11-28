import {
  extractRuleAttributeAccesses,
  formatBusinessQuantity,
  isWhatIfDeadline,
  type DomainGraph,
  type FlowStepTrace,
} from '@evidence-poc/evidence-model-core';
import type { AttributeAST, RuleAST } from '@evidence-poc/evidence-schema';
import { whatIfJargon } from './responseSchemas.js';
import { businessDate, businessTextValue } from './storyDocument.js';
import type {
  StoryScene,
  WhatIfRuleOutcome,
  WhatIfStoryContext,
} from './types.js';

export function whatIfStoryContext(
  scene: StoryScene,
  asOf: string,
): WhatIfStoryContext {
  const { actor, recipient, workObject } = scene.activity;
  const next = scene.expectation;
  const nextParty =
    next?.assignedToRoleLabel === '责任方待明确'
      ? '后续经办方'
      : next?.assignedToRoleLabel;
  return {
    actorLabel: actor.roleId ? actor.roleLabel : '经办方',
    counterpartyLabel: recipient?.roleLabel,
    workObjectTitle: workObject.entityLabel,
    referenceCode: workObject.referenceCode,
    displayDate: businessDate(asOf) ?? '约定时点',
    nextExpectation:
      next &&
      (next.isControlGap
        ? `${nextParty}落实${next.expectedWorkObject}`
        : `${nextParty}办理《${next.expectedWorkObject}》`),
  };
}

interface BusinessFact {
  label: string;
  value: string;
}

function businessValue(
  field: AttributeAST,
  value: unknown,
  graph: DomainGraph,
  stepLabels: ReadonlyMap<string, string>,
): string {
  if (value == null) return '未填写';
  if (Array.isArray(value))
    return value.length
      ? value
          .map((item) => businessValue(field, item, graph, stepLabels))
          .join('、')
      : '无';
  if (
    field.valueType === 'money' ||
    field.valueType === 'int' ||
    field.valueType === 'uint' ||
    typeof value === 'number'
  )
    return formatBusinessQuantity(field, value) ?? '金额单位待核对';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value !== 'string') return '见所附明细';
  return businessTextValue(value, field, graph, (ref) => stepLabels.get(ref));
}

export function whatIfBusinessFacts(
  graph: DomainGraph,
  entityId: string,
  values: Readonly<Record<string, unknown>>,
  stepLabels: ReadonlyMap<string, string>,
): BusinessFact[] {
  return graph
    .attributesOf(entityId)
    .filter(({ name }) => Object.hasOwn(values, name))
    .map((field) => ({
      label: field.label.replace(/最小(?:货币)?单位/gu, ''),
      value: businessValue(field, values[field.name], graph, stepLabels),
    }));
}

/** Cite a term the decision actually reads, from an unambiguous causal request. */
export function whatIfCommitment(
  graph: DomainGraph,
  rules: readonly RuleAST[],
  steps: readonly FlowStepTrace[],
  valuesOf: (step: FlowStepTrace) => Record<string, unknown>,
  stepLabels: ReadonlyMap<string, string>,
): BusinessFact | undefined {
  let deadline: BusinessFact | undefined;
  for (const rule of rules) {
    for (const { entityRef, attribute } of extractRuleAttributeAccesses(rule)
      .accesses) {
      const [request, other] = steps.filter(
        (step) =>
          step.entityKind === 'fulfillment_request' &&
          step.entityId === entityRef,
      );
      const field = graph.attribute(entityRef, attribute);
      if (!request || other || !field) continue;
      const value = valuesOf(request)[attribute];
      if (value == null) continue;
      if (isWhatIfDeadline(field))
        deadline = {
          label: field.label,
          value: businessValue(field, value, graph, stepLabels),
        };
      if (
        ['money', 'int', 'uint', 'decimal', 'double'].includes(
          field.valueType ?? '',
        )
      ) {
        const quantity = formatBusinessQuantity(field, value);
        if (quantity !== undefined)
          return { label: field.label, value: quantity };
      }
    }
  }
  return deadline;
}

/** Use the Chinese part of bilingual document and role labels in running prose. */
const shortTitle = (label: string) =>
  label.replace(/（[A-Za-z][^（）]*）/gu, '').trim() || label;

function describeDecisions(outcomes: readonly WhatIfRuleOutcome[]): string {
  const completion = outcomes.filter(
    (outcome) => outcome.kind === 'completion',
  );
  const breach = outcomes.filter((outcome) => outcome.kind === 'breach');
  const findings: string[] = [];
  if (completion.length) {
    const met = completion.filter((outcome) => outcome.result).length;
    findings.push(
      met === completion.length
        ? '现有凭据满足约定的完成条件'
        : met
          ? '部分完成条件仍缺少履约凭据'
          : '现有凭据尚不足以确认履约完成',
    );
  }
  if (breach.length) {
    const triggered = breach.find((outcome) => outcome.result);
    const label = triggered && shortTitle(triggered.label);
    findings.push(
      !triggered
        ? '此次核对未触发违约'
        : label && label.length <= 16 && !whatIfJargon.test(label)
          ? `已触发「${label}」的违约约定`
          : '已触发约定的违约条件',
    );
  }
  return findings.join('，');
}

export function buildLocalStoryExplanation(
  context: WhatIfStoryContext,
  changes: readonly BusinessFact[],
  outcomes: readonly WhatIfRuleOutcome[],
  commitment?: BusinessFact,
  obligation?: { action?: string; obligor?: string },
): string {
  const {
    actorLabel,
    workObjectTitle,
    displayDate,
    nextExpectation,
    counterpartyLabel,
    completionGap,
  } = context;
  const change = changes
    .map(
      ({ label, value }) =>
        `「${label}」为${value === displayDate ? '该时点' : value}`,
    )
    .join('、');
  const decisions = completionGap
    ? '已超过约定的截止时限，履约条件未达成，构成逾期违约'
    : describeDecisions(outcomes);
  const adverse = outcomes.some(({ kind, result }) =>
    kind === 'breach' ? result : !result,
  );
  const handoff = adverse
    ? '核对差异并商定补正办法，再安排'
    : '整理本次核对的履约凭据，供';
  // Reserve room for all three sentences. Insert complete names and terms in priority order.
  const parts = {
    actor: '经办方',
    document: '当前凭证',
    change: changes.length ? '记录按假设发生变化' : '仍只有此前取得的履约凭据',
    basis: '对照双方约定，',
    parties: '双方',
    next: adverse ? '后续工作' : '后续经办时核对',
  };
  const story = () => {
    const next = completionGap
      ? `依赖这项交付的后续步骤将被阻断，${parts.parties}需核对凭据并商定补救安排。`
      : `${parts.parties}需${handoff}${parts.next}。`;
    return `假设到了${displayDate}，${parts.actor}复核《${parts.document}》，${parts.change}。${parts.basis}${decisions}。${next}`;
  };
  const missing = completionGap?.missingConfirmations
    .map((label) => `《${shortTitle(label)}》`)
    .join('、');
  const obligor = obligation?.obligor
    ? shortTitle(obligation.obligor)
    : '义务方';
  const evidence = missing ? `${obligor}尚未出具${missing}` : undefined;
  const details: [keyof typeof parts, string | undefined][] = [
    ['actor', shortTitle(actorLabel)],
    ['document', shortTitle(workObjectTitle)],
    [
      'change',
      evidence ??
        (change
          ? `发现${change}`
          : obligation?.action &&
            `查验${obligor}${shortTitle(obligation.action)}的履约凭据`),
    ],
    [
      'next',
      !completionGap && nextExpectation
        ? `${shortTitle(nextExpectation)}${adverse ? '' : '时查验'}`
        : undefined,
    ],
    [
      'basis',
      commitment
        ? `请求载明${commitment.label}为${commitment.value}，`
        : completionGap && `约定期限为${completionGap.deadline}，`,
    ],
    [
      'parties',
      counterpartyLabel &&
        `${shortTitle(actorLabel)}与${shortTitle(counterpartyLabel)}`,
    ],
  ];
  for (const [key, detail] of details) {
    if (
      detail &&
      !whatIfJargon.test(detail) &&
      story().length - parts[key].length + detail.length <= 150
    )
      parts[key] = detail;
  }
  const prose = story();
  return prose.length >= 100
    ? prose
    : `${prose}交接时可一并列明双方核对过的凭据和仍需确认的事项，便于下一位经办人复核。`;
}
