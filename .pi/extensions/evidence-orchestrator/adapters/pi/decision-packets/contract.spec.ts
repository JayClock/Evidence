import { describe, expect, it } from 'vitest';
import {
  DECISION_PACKET_LIMITS,
  canonicalDecisionJson,
  decisionPacketSha256,
  sanitizeDecisionText,
  validateDecisionPacket,
  type HumanDecisionPacket,
} from './contract';

type Action = 'approve' | 'revise';

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing Decision Packet fixture.');
  return value;
}

function packet(
  overrides: Partial<HumanDecisionPacket<Action>> = {},
): HumanDecisionPacket<Action> {
  return {
    version: 1,
    packet_kind: 'tasking_desk_check',
    iteration_id: 'ITER-0001',
    loop: 'Tasking',
    stage: 'Desk Check',
    title: 'Review one complete Story plan',
    authority_request: 'Approve the plan or route one knowledge gap.',
    authority_scope: [
      'Scenario to TEST and TASK traceability',
      'Execution budget',
    ],
    authority_exclusions: ['Code implementation', 'Product value acceptance'],
    subject_label: 'DRAFT-001 · US-001 · SC-001',
    subject_sha256: 'a'.repeat(64),
    sections: [
      {
        id: 'acceptance',
        title: 'Acceptance boundary',
        items: [
          {
            label: 'Story and Scenario',
            value: 'US-001 · SC-001 · 工作区名称',
            detail: 'Every Then outcome has one Q2 acceptance intent.',
            evidence_ref_labels: ['Test list'],
          },
        ],
      },
    ],
    checks: [
      {
        id: 'candidate',
        label: 'Candidate integrity',
        status: 'pass',
        detail: 'Candidate artifacts and process materialization are intact.',
        evidence_ref_labels: ['Tasking candidate'],
      },
    ],
    evidence_refs: [
      {
        label: 'Tasking candidate',
        path: 'artifacts/04-planning/test-plan.candidate.json',
        sha256: 'b'.repeat(64),
      },
      {
        label: 'Test list',
        path: 'artifacts/04-planning/test-list.md',
        sha256: 'c'.repeat(64),
      },
    ],
    actions: [
      {
        id: 'approve',
        label: 'Approve current plan',
        description: 'Approve the complete reviewed plan.',
        effect: 'Create the immutable plan and enter Pair.',
        tone: 'approve',
        reason_mode: 'optional',
        enabled: true,
      },
      {
        id: 'revise',
        label: 'Revise test and task lists',
        description: 'Return the candidate for revision.',
        effect: 'Remain in Tasking drafting.',
        tone: 'feedback',
        reason_mode: 'required',
        enabled: true,
      },
    ],
    ...overrides,
  };
}

describe('Decision Packet contract', () => {
  it('accepts a bounded Unicode packet without changing its data', () => {
    const value = packet();

    expect(validateDecisionPacket(value)).toBe(value);
    expect(value.sections[0]?.items[0]?.value).toContain('工作区名称');
  });

  it.each([
    [
      'section ids',
      () => {
        const value = packet();
        value.sections.push({ ...required(value.sections[0]) });
        return value;
      },
    ],
    [
      'check ids',
      () => {
        const value = packet();
        value.checks.push({ ...required(value.checks[0]) });
        return value;
      },
    ],
    [
      'action ids',
      () => {
        const value = packet();
        value.actions.push({ ...required(value.actions[1]) });
        return value;
      },
    ],
    [
      'evidence labels',
      () => {
        const value = packet();
        value.evidence_refs.push({ ...required(value.evidence_refs[0]) });
        return value;
      },
    ],
  ])('rejects duplicate %s', (_subject, build) => {
    expect(() => validateDecisionPacket(build())).toThrow('must be unique');
  });

  it('rejects missing evidence references', () => {
    const value = packet();
    required(required(value.sections[0]).items[0]).evidence_ref_labels = [
      'Missing artifact',
    ];

    expect(() => validateDecisionPacket(value)).toThrow(
      'references missing evidence',
    );
  });

  it('rejects enabled approval while any readiness check is blocked', () => {
    const value = packet();
    required(value.checks[0]).status = 'blocked';

    expect(() => validateDecisionPacket(value)).toThrow(
      'cannot enable approve',
    );
    value.actions[0] = {
      ...required(value.actions[0]),
      enabled: false,
      disabled_reason: 'Candidate integrity is blocked.',
    };
    expect(validateDecisionPacket(value)).toBe(value);
  });

  it('enforces disabled reasons and keeps one safe non-approve action', () => {
    const missingReason = packet();
    missingReason.actions[0] = {
      ...required(missingReason.actions[0]),
      enabled: false,
    };
    expect(() => validateDecisionPacket(missingReason)).toThrow(
      'requires disabled_reason',
    );

    const enabledReason = packet();
    enabledReason.actions[0] = {
      ...required(enabledReason.actions[0]),
      disabled_reason: 'Not applicable.',
    };
    expect(() => validateDecisionPacket(enabledReason)).toThrow(
      'enabled action cannot',
    );

    const noSafeAction = packet({
      actions: [required(packet().actions[0])],
    });
    expect(() => validateDecisionPacket(noSafeAction)).toThrow(
      'enabled non-approve action',
    );
  });

  it.each([
    ['ANSI', '\u001b[31mblocked\u001b[0m'],
    ['OSC', '\u001b]8;;https://example.test\u0007link\u001b]8;;\u0007'],
    ['C0', 'unsafe\u0001text'],
    ['C1', 'unsafe\u0085text'],
  ])('rejects raw %s terminal controls', (_kind, unsafe) => {
    const value = packet({ title: unsafe });
    expect(() => validateDecisionPacket(value)).toThrow(
      'terminal control characters',
    );
  });

  it('sanitizes controls, normalizes newlines, and marks truncation explicitly', () => {
    const sanitized = sanitizeDecisionText(
      '保留中文\r\n\u001b[31m危险\u001b[0m\u0001文本',
    );
    expect(sanitized).toBe('保留中文\n危险 文本');

    const truncated = sanitizeDecisionText('证'.repeat(100), 40);
    expect([...truncated].length).toBeLessThanOrEqual(40);
    expect(truncated).toMatch(/\[truncated \d+ chars\]$/);
  });

  it('rejects unknown root and nested fields', () => {
    expect(() =>
      validateDecisionPacket({ ...packet(), authority: true } as never),
    ).toThrow('unknown: authority');

    const nested = packet();
    const section = required(nested.sections[0]);
    section.items[0] = {
      ...required(section.items[0]),
      markdown: true,
    } as never;
    expect(() => validateDecisionPacket(nested)).toThrow('unknown: markdown');
  });

  it('enforces field, array, and total JSON limits', () => {
    expect(() =>
      validateDecisionPacket(
        packet({
          title: 'x'.repeat(DECISION_PACKET_LIMITS.displayValueCodePoints + 1),
        }),
      ),
    ).toThrow('Unicode code points');

    const tooManySections = packet({
      sections: Array.from(
        { length: DECISION_PACKET_LIMITS.sections + 1 },
        (_, index) => ({
          id: `s-${index}`,
          title: `Section ${index}`,
          items: [],
        }),
      ),
    });
    expect(() => validateDecisionPacket(tooManySections)).toThrow(
      'sections exceeds',
    );

    const oversized = packet({
      sections: Array.from({ length: 12 }, (_, sectionIndex) => ({
        id: `section-${sectionIndex}`,
        title: `Section ${sectionIndex}`,
        items: Array.from({ length: 2 }, (_, itemIndex) => ({
          label: `Item ${sectionIndex}-${itemIndex}`,
          value: 'x'.repeat(1_500),
        })),
      })),
    });
    expect(() => validateDecisionPacket(oversized)).toThrow('JSON bytes');
  });

  it('canonicalizes key order and produces a stable SHA-256', () => {
    const value = packet();
    const reordered = Object.fromEntries(
      Object.entries(value).reverse(),
    ) as unknown as HumanDecisionPacket<Action>;

    expect(canonicalDecisionJson(reordered)).toBe(canonicalDecisionJson(value));
    expect(decisionPacketSha256(reordered)).toBe(decisionPacketSha256(value));
    expect(decisionPacketSha256(value)).toMatch(/^[a-f0-9]{64}$/);
  });
});
