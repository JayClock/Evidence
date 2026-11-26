import type {
  DomainGraph,
  FlowStepTrace,
} from '@evidence-poc/evidence-model-core';
import {
  classifyKeyDataSource,
  compactCanonicalJson,
  isContractContext,
  KEY_DATA_SOURCE_LABELS,
  type AttributeAST,
} from '@evidence-poc/evidence-schema';
import type { DocumentCardField, StoryScene } from './types.js';

/** Use the wall clock and offset declared by the example, not the machine's timezone. */
export const businessDate = (value: string): string | undefined => {
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/iu.exec(
      value,
    );
  if (!parts || !Number.isFinite(Date.parse(value))) return undefined;
  const [, year, month, day, minute, second, zone] = parts;
  return `${year}年${Number(month)}月${Number(day)}日${minute ? ` ${minute}${second === '00' ? '' : `:${second}`} ${zone?.toUpperCase() === 'Z' ? 'UTC' : `UTC${zone}`}` : ''}`;
};

const formatMoney = (value: unknown): string | undefined => {
  if (
    !value ||
    typeof value !== 'object' ||
    !('minorUnits' in value) ||
    typeof value.minorUnits !== 'number' ||
    !Number.isSafeInteger(value.minorUnits) ||
    !('currency' in value) ||
    typeof value.currency !== 'string' ||
    !/^[A-Z]{3}$/u.test(value.currency)
  )
    return undefined;
  // For unknown codes, keep the declared integer rather than assuming a subunit scale.
  if (!Intl.supportedValuesOf('currency').includes(value.currency))
    return `${value.minorUnits} ${value.currency}（最小货币单位）`;
  const format = new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: value.currency,
  });
  const digits = format.resolvedOptions().maximumFractionDigits;
  if (digits === undefined) return undefined;
  const minor = BigInt(value.minorUnits);
  const scale = 10n ** BigInt(digits);
  const whole = minor / scale;
  const fraction = (minor < 0n ? -minor : minor) % scale;
  return format
    .formatToParts(whole === 0n && minor < 0n ? -0 : whole)
    .map(({ type, value: part }) =>
      type === 'fraction' ? String(fraction).padStart(digits, '0') : part,
    )
    .join('');
};

export const documentReferenceOf = ({
  values,
}: FlowStepTrace): string | undefined => {
  for (const value of [values.ref, values.id]) {
    if (
      typeof value === 'string' &&
      value.trim() &&
      !/^[a-f0-9]{32,}$/iu.test(value)
    )
      return value;
  }
  return undefined;
};

export const buildStoryDocument = (
  step: FlowStepTrace,
  graph: DomainGraph | undefined,
  referenceLabel: (ref: string) => string | undefined,
): StoryScene['documentCard'] => {
  const entity = graph?.getEntity(step.entityId);
  const context =
    entity && 'contextRef' in entity && entity.contextRef
      ? graph?.getEntity(entity.contextRef)
      : undefined;
  const attributes = new Map(
    graph
      ?.attributesOf(step.entityId)
      .map((attribute) => [attribute.name, attribute]),
  );
  const keyAttributes: DocumentCardField[] = [];
  const generalAttributes: DocumentCardField[] = [];
  const clauses = new Set<string>();
  const displayValue = (
    value: unknown,
    attribute: AttributeAST | undefined,
    name: string,
  ): string => {
    if (value === null) return '未填写';
    if (typeof value === 'boolean') return value ? '是' : '否';
    if (attribute?.valueType === 'money') {
      const money = formatMoney(value);
      if (money) return money;
    }
    if (Array.isArray(value))
      return value
        .map((item: unknown) => displayValue(item, attribute, name))
        .join('、');
    if (typeof value !== 'string') return compactCanonicalJson(value);
    const date = businessDate(value);
    if (date) return date;
    if (
      name !== 'id' &&
      name !== 'ref' &&
      (attribute?.valueType === 'id' ||
        attribute?.source?.kind === 'preceding-evidence' ||
        value.includes('#'))
    )
      return (
        referenceLabel(value) ??
        graph?.getEntity(value)?.label ??
        (/^(?:[^#]+#|[a-f0-9]{32,}$)/iu.test(value) ? '关联单据待明确' : value)
      );
    return /^[a-f0-9]{32,}$/iu.test(value) ? '未提供业务编号' : value;
  };
  const fieldNames = new Set(Object.keys(step.values));
  for (const attribute of attributes.values()) {
    if (attribute.keyData) fieldNames.add(attribute.name);
  }
  for (const name of [...fieldNames].sort()) {
    const attribute = attributes.get(name);
    const source = attribute?.source;
    const sourceEntity =
      source && 'entityRef' in source
        ? graph?.getEntity(source.entityRef)
        : undefined;
    const sourceAttribute =
      source && 'attribute' in source
        ? sourceEntity?.attributes?.find(
            ({ name }) => name === source.attribute,
          )
        : undefined;
    const reference =
      sourceEntity && sourceAttribute
        ? `《${sourceEntity.label}》 · ${sourceAttribute.label}`
        : undefined;
    if (source?.kind === 'contract-term' && reference) clauses.add(reference);
    const sourceOrigin =
      reference ??
      (source && 'entityRef' in source
        ? '引用字段待核对'
        : attribute?.derivedByRuleRef
          ? (graph?.getRule(attribute.derivedByRuleRef)?.label ??
            '派生规则待核对')
          : entity && attribute?.keyData
            ? KEY_DATA_SOURCE_LABELS[classifyKeyDataSource(entity, attribute)]
            : undefined);
    (attribute?.keyData ? keyAttributes : generalAttributes).push({
      name,
      label: attribute?.label ?? name,
      value: Object.hasOwn(step.values, name)
        ? displayValue(step.values[name], attribute, name)
        : '示例未提供',
      ...(sourceOrigin ? { sourceOrigin } : {}),
    });
  }
  return {
    title: step.entityLabel,
    ...(isContractContext(context) && { contractContext: context.label }),
    keyAttributes,
    generalAttributes,
    ...(clauses.size ? { clauseRef: [...clauses].join('、') } : {}),
  };
};
