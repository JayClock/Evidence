import { createHash } from 'node:crypto';

export type DecisionCheckStatus = 'pass' | 'warning' | 'blocked';
export type DecisionActionTone = 'neutral' | 'approve' | 'feedback' | 'stop';
export type DecisionReasonMode = 'none' | 'optional' | 'required';

export interface DecisionPacketEvidenceRef {
  label: string;
  path: string;
  sha256?: string;
}

export interface DecisionPacketItem {
  label: string;
  value: string;
  detail?: string;
  evidence_ref_labels?: string[];
}

export interface DecisionPacketSection {
  id: string;
  title: string;
  items: DecisionPacketItem[];
}

export interface DecisionPacketCheck {
  id: string;
  label: string;
  status: DecisionCheckStatus;
  detail: string;
  evidence_ref_labels?: string[];
}

export interface DecisionPacketAction<TAction extends string = string> {
  id: TAction;
  label: string;
  description: string;
  effect: string;
  tone: DecisionActionTone;
  reason_mode: DecisionReasonMode;
  enabled: boolean;
  disabled_reason?: string;
}

export interface HumanDecisionPacket<TAction extends string = string> {
  version: 1;
  packet_kind: string;
  iteration_id: string;
  loop: string;
  stage: string;
  title: string;
  authority_request: string;
  authority_scope: string[];
  authority_exclusions: string[];
  subject_label: string;
  subject_sha256: string;
  sections: DecisionPacketSection[];
  checks: DecisionPacketCheck[];
  evidence_refs: DecisionPacketEvidenceRef[];
  actions: DecisionPacketAction<TAction>[];
}

export const DECISION_PACKET_LIMITS = {
  jsonBytes: 32 * 1024,
  renderedBytes: 16 * 1024,
  sections: 12,
  itemsPerSection: 20,
  checks: 20,
  evidenceRefs: 50,
  actions: 8,
  displayValueCodePoints: 2 * 1024,
  idCodePoints: 128,
} as const;

const ROOT_FIELDS = [
  'version',
  'packet_kind',
  'iteration_id',
  'loop',
  'stage',
  'title',
  'authority_request',
  'authority_scope',
  'authority_exclusions',
  'subject_label',
  'subject_sha256',
  'sections',
  'checks',
  'evidence_refs',
  'actions',
] as const;
const ANSI_OR_OSC_PATTERN = new RegExp(
  String.raw`\u001b(?:\][^\u0007]*(?:\u0007|\u001b\\)|\[[0-?]*[ -/]*[@-~]|[()][0-2A-Z]|[@-_])`,
  'gu',
);
const UNSAFE_CONTROL_PATTERN = new RegExp(
  String.raw`[\u0000-\u0009\u000b-\u001f\u007f-\u009f]`,
  'u',
);
const UNSAFE_CONTROL_GLOBAL_PATTERN = new RegExp(
  String.raw`[\u0000-\u0009\u000b-\u001f\u007f-\u009f]`,
  'gu',
);

function record(value: unknown, subject: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${subject} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactFields(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  subject: string,
): void {
  const allowed = new Set([...required, ...optional]);
  const unknown = Object.keys(value).filter((field) => !allowed.has(field));
  const missing = required.filter((field) => !(field in value));
  if (unknown.length > 0 || missing.length > 0) {
    throw new Error(
      `${subject} fields are invalid${missing.length ? `; missing: ${missing.join(', ')}` : ''}${unknown.length ? `; unknown: ${unknown.join(', ')}` : ''}.`,
    );
  }
}

function codePointLength(value: string): number {
  return [...value].length;
}

function text(
  value: unknown,
  subject: string,
  maxCodePoints = DECISION_PACKET_LIMITS.displayValueCodePoints,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${subject} must be a non-empty string.`);
  }
  if (codePointLength(value) > maxCodePoints) {
    throw new Error(`${subject} exceeds ${maxCodePoints} Unicode code points.`);
  }
  ANSI_OR_OSC_PATTERN.lastIndex = 0;
  if (
    value.includes('\r') ||
    ANSI_OR_OSC_PATTERN.test(value) ||
    UNSAFE_CONTROL_PATTERN.test(value)
  ) {
    throw new Error(`${subject} contains terminal control characters.`);
  }
  return value;
}

function id(value: unknown, subject: string): string {
  return text(value, subject, DECISION_PACKET_LIMITS.idCodePoints);
}

function array(value: unknown, subject: string, maximum: number): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${subject} must be an array.`);
  if (value.length > maximum) {
    throw new Error(`${subject} exceeds ${maximum} entries.`);
  }
  return value;
}

function stringArray(
  value: unknown,
  subject: string,
  maximum: number,
): string[] {
  return array(value, subject, maximum).map((item, index) =>
    text(item, `${subject}[${index}]`),
  );
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  subject: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`${subject} must be one of: ${allowed.join(', ')}.`);
  }
  return value as T;
}

function unique(values: string[], subject: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${subject} must be unique.`);
  }
}

function optionalEvidenceLabels(
  value: unknown,
  subject: string,
  evidenceLabels: ReadonlySet<string>,
): void {
  if (value === undefined) return;
  const labels = stringArray(
    value,
    subject,
    DECISION_PACKET_LIMITS.evidenceRefs,
  );
  unique(labels, subject);
  const missing = labels.filter((label) => !evidenceLabels.has(label));
  if (missing.length > 0) {
    throw new Error(
      `${subject} references missing evidence: ${missing.join(', ')}.`,
    );
  }
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => [key, canonicalValue(item)]),
  );
}

export function canonicalDecisionJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function decisionPacketSha256(packet: HumanDecisionPacket): string {
  validateDecisionPacket(packet);
  return createHash('sha256')
    .update(canonicalDecisionJson(packet))
    .digest('hex');
}

/** Remove terminal controls and truncate one field with an explicit marker. */
export function sanitizeDecisionText(
  value: string,
  maxCodePoints = DECISION_PACKET_LIMITS.displayValueCodePoints,
): string {
  if (!Number.isSafeInteger(maxCodePoints) || maxCodePoints < 32) {
    throw new Error('Decision text limit must be an integer of at least 32.');
  }
  ANSI_OR_OSC_PATTERN.lastIndex = 0;
  UNSAFE_CONTROL_GLOBAL_PATTERN.lastIndex = 0;
  let sanitized = value
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replace(ANSI_OR_OSC_PATTERN, '')
    .replace(UNSAFE_CONTROL_GLOBAL_PATTERN, ' ');
  const points = [...sanitized];
  if (points.length <= maxCodePoints) return sanitized;
  let keep = maxCodePoints;
  let marker = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    marker = `… [truncated ${points.length - keep} chars]`;
    const nextKeep = Math.max(0, maxCodePoints - [...marker].length);
    if (nextKeep === keep) break;
    keep = nextKeep;
  }
  marker = `… [truncated ${points.length - keep} chars]`;
  keep = Math.max(0, maxCodePoints - [...marker].length);
  sanitized = `${points.slice(0, keep).join('')}${marker}`;
  return sanitized;
}

/** Strictly validate a bounded, callback-free Decision Packet projection. */
export function validateDecisionPacket<TAction extends string>(
  value: HumanDecisionPacket<TAction>,
): HumanDecisionPacket<TAction> {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error('Decision Packet must be JSON serializable.');
  }
  if (Buffer.byteLength(serialized) > DECISION_PACKET_LIMITS.jsonBytes) {
    throw new Error(
      `Decision Packet exceeds ${DECISION_PACKET_LIMITS.jsonBytes} JSON bytes.`,
    );
  }

  const root = record(value, 'Decision Packet');
  exactFields(root, ROOT_FIELDS, [], 'Decision Packet');
  if (root.version !== 1) throw new Error('Decision Packet version must be 1.');
  for (const field of [
    'packet_kind',
    'iteration_id',
    'loop',
    'stage',
    'title',
    'authority_request',
    'subject_label',
  ] as const) {
    text(root[field], `Decision Packet.${field}`);
  }
  if (
    typeof root.subject_sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(root.subject_sha256)
  ) {
    throw new Error(
      'Decision Packet.subject_sha256 must be 64 lowercase hexadecimal characters.',
    );
  }
  stringArray(
    root.authority_scope,
    'Decision Packet.authority_scope',
    DECISION_PACKET_LIMITS.itemsPerSection,
  );
  stringArray(
    root.authority_exclusions,
    'Decision Packet.authority_exclusions',
    DECISION_PACKET_LIMITS.itemsPerSection,
  );

  const evidence = array(
    root.evidence_refs,
    'Decision Packet.evidence_refs',
    DECISION_PACKET_LIMITS.evidenceRefs,
  ).map((item, index) => {
    const reference = record(item, `evidence_refs[${index}]`);
    exactFields(
      reference,
      ['label', 'path'],
      ['sha256'],
      `evidence_refs[${index}]`,
    );
    const label = text(reference.label, `evidence_refs[${index}].label`);
    text(reference.path, `evidence_refs[${index}].path`);
    if (
      reference.sha256 !== undefined &&
      (typeof reference.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(reference.sha256))
    ) {
      throw new Error(
        `evidence_refs[${index}].sha256 must be 64 lowercase hexadecimal characters.`,
      );
    }
    return label;
  });
  unique(evidence, 'Decision Packet evidence labels');
  const evidenceLabels = new Set(evidence);

  const sections = array(
    root.sections,
    'Decision Packet.sections',
    DECISION_PACKET_LIMITS.sections,
  ).map((item, sectionIndex) => {
    const section = record(item, `sections[${sectionIndex}]`);
    exactFields(
      section,
      ['id', 'title', 'items'],
      [],
      `sections[${sectionIndex}]`,
    );
    const sectionId = id(section.id, `sections[${sectionIndex}].id`);
    text(section.title, `sections[${sectionIndex}].title`);
    array(
      section.items,
      `sections[${sectionIndex}].items`,
      DECISION_PACKET_LIMITS.itemsPerSection,
    ).forEach((entry, itemIndex) => {
      const packetItem = record(
        entry,
        `sections[${sectionIndex}].items[${itemIndex}]`,
      );
      exactFields(
        packetItem,
        ['label', 'value'],
        ['detail', 'evidence_ref_labels'],
        `sections[${sectionIndex}].items[${itemIndex}]`,
      );
      text(
        packetItem.label,
        `sections[${sectionIndex}].items[${itemIndex}].label`,
      );
      text(
        packetItem.value,
        `sections[${sectionIndex}].items[${itemIndex}].value`,
      );
      if (packetItem.detail !== undefined) {
        text(
          packetItem.detail,
          `sections[${sectionIndex}].items[${itemIndex}].detail`,
        );
      }
      optionalEvidenceLabels(
        packetItem.evidence_ref_labels,
        `sections[${sectionIndex}].items[${itemIndex}].evidence_ref_labels`,
        evidenceLabels,
      );
    });
    return sectionId;
  });
  unique(sections, 'Decision Packet section ids');

  const checks = array(
    root.checks,
    'Decision Packet.checks',
    DECISION_PACKET_LIMITS.checks,
  ).map((item, index) => {
    const check = record(item, `checks[${index}]`);
    exactFields(
      check,
      ['id', 'label', 'status', 'detail'],
      ['evidence_ref_labels'],
      `checks[${index}]`,
    );
    const checkId = id(check.id, `checks[${index}].id`);
    text(check.label, `checks[${index}].label`);
    oneOf(
      check.status,
      ['pass', 'warning', 'blocked'],
      `checks[${index}].status`,
    );
    text(check.detail, `checks[${index}].detail`);
    optionalEvidenceLabels(
      check.evidence_ref_labels,
      `checks[${index}].evidence_ref_labels`,
      evidenceLabels,
    );
    return checkId;
  });
  unique(checks, 'Decision Packet check ids');

  const actions = array(
    root.actions,
    'Decision Packet.actions',
    DECISION_PACKET_LIMITS.actions,
  ).map((item, index) => {
    const action = record(item, `actions[${index}]`);
    exactFields(
      action,
      [
        'id',
        'label',
        'description',
        'effect',
        'tone',
        'reason_mode',
        'enabled',
      ],
      ['disabled_reason'],
      `actions[${index}]`,
    );
    const actionId = id(action.id, `actions[${index}].id`);
    text(action.label, `actions[${index}].label`);
    text(action.description, `actions[${index}].description`);
    text(action.effect, `actions[${index}].effect`);
    const tone = oneOf(
      action.tone,
      ['neutral', 'approve', 'feedback', 'stop'],
      `actions[${index}].tone`,
    );
    oneOf(
      action.reason_mode,
      ['none', 'optional', 'required'],
      `actions[${index}].reason_mode`,
    );
    if (typeof action.enabled !== 'boolean') {
      throw new Error(`actions[${index}].enabled must be boolean.`);
    }
    if (!action.enabled && action.disabled_reason === undefined) {
      throw new Error(
        `actions[${index}] disabled action requires disabled_reason.`,
      );
    }
    if (action.enabled && action.disabled_reason !== undefined) {
      throw new Error(
        `actions[${index}] enabled action cannot have disabled_reason.`,
      );
    }
    if (action.disabled_reason !== undefined) {
      text(action.disabled_reason, `actions[${index}].disabled_reason`);
    }
    return { id: actionId, tone, enabled: action.enabled };
  });
  unique(
    actions.map((action) => action.id),
    'Decision Packet action ids',
  );
  if (!actions.some(({ enabled, tone }) => enabled && tone !== 'approve')) {
    throw new Error('Decision Packet requires an enabled non-approve action.');
  }
  if (
    root.checks instanceof Array &&
    root.checks.some(
      (check) =>
        typeof check === 'object' &&
        check !== null &&
        (check as { status?: unknown }).status === 'blocked',
    ) &&
    actions.some(({ enabled, tone }) => enabled && tone === 'approve')
  ) {
    throw new Error(
      'Decision Packet cannot enable approve while a check is blocked.',
    );
  }
  return value;
}
