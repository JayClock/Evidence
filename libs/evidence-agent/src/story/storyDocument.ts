import {
  formatBusinessQuantity,
  type DomainGraph,
  type FlowStepTrace,
} from '@evidence-poc/evidence-model-core';
import {
  compactCanonicalJson,
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

export function businessTextValue(
  value: string,
  field: Pick<AttributeAST, 'name' | 'valueType' | 'source'>,
  graph?: DomainGraph,
  referenceLabel?: (ref: string) => string | undefined,
): string {
  const date = businessDate(value);
  if (date) return date;
  if (
    field.name !== 'id' &&
    field.name !== 'ref' &&
    (field.valueType === 'id' ||
      field.source?.kind === 'preceding-evidence' ||
      value.includes('#'))
  ) {
    return (
      referenceLabel?.(value) ??
      graph?.getEntity(value)?.label ??
      (/^(?:[^#]+#|[a-f0-9]{32,}$)/iu.test(value) ? '关联单据待明确' : value)
    );
  }
  return /^[a-f0-9]{32,}$/iu.test(value) ? '未提供业务编号' : value;
}

export const buildStoryDocument = (
  step: FlowStepTrace,
  graph: DomainGraph | undefined,
  referenceLabel: (ref: string) => string | undefined,
): StoryScene['documentCard'] => {
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
      const money = formatBusinessQuantity(attribute, value, 'symbol');
      if (money) return money;
    }
    if (Array.isArray(value))
      return value
        .map((item: unknown) => displayValue(item, attribute, name))
        .join('、');
    if (typeof value !== 'string') return compactCanonicalJson(value);
    return businessTextValue(
      value,
      attribute ?? { name },
      graph,
      referenceLabel,
    );
  };
  for (const name of Object.keys(step.values).sort()) {
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
    const sourceOrigin = sourceEntity
      ? `《${sourceEntity.label}》${sourceAttribute ? ` · ${sourceAttribute.label}` : ''}`
      : undefined;
    if (source?.kind === 'contract-term' && sourceOrigin)
      clauses.add(sourceOrigin);
    (attribute?.keyData ? keyAttributes : generalAttributes).push({
      name,
      label: attribute?.label ?? name,
      value: displayValue(step.values[name], attribute, name),
      ...(sourceOrigin ? { sourceOrigin } : {}),
    });
  }
  return {
    title: step.entityLabel,
    keyAttributes,
    generalAttributes,
    ...(clauses.size ? { clauseRef: [...clauses].join('、') } : {}),
  };
};
