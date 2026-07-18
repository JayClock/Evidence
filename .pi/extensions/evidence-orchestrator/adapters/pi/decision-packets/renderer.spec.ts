import { visibleWidth } from '@earendil-works/pi-tui';
import { describe, expect, it } from 'vitest';
import type { HumanDecisionPacket } from './contract';
import {
  boundDecisionList,
  renderDecisionPacketReview,
  renderDecisionPacketViewport,
} from './renderer';

function packet(
  overrides: Partial<HumanDecisionPacket<'approve' | 'revise'>> = {},
): HumanDecisionPacket<'approve' | 'revise'> {
  return {
    version: 1,
    packet_kind: 'tasking_desk_check',
    iteration_id: 'ITER-0001',
    loop: 'Tasking',
    stage: 'Desk Check',
    title: 'Review one complete Story plan',
    authority_request: 'Approve the plan or route feedback.',
    authority_scope: ['Scenario → Q2/Q1 → TEST → TASK → process → budget'],
    authority_exclusions: ['Code, test results, Showcase, and product value'],
    subject_label: 'DRAFT-001 · US-001 · SC-001',
    subject_sha256: 'a'.repeat(64),
    sections: [
      {
        id: 'commands',
        title: 'Commands and gates',
        items: [
          {
            label: 'Focused command',
            value:
              'pnpm nx test @evidence/web-feature-diagrams --run --testNamePattern=领域建模负责人可以查看很长的工作区名称'.repeat(
                2,
              ),
            evidence_ref_labels: ['Approved candidate'],
          },
          {
            label: 'Long path',
            value: `artifacts/${'非常长的目录/'.repeat(20)}test-plan.candidate.json`,
          },
        ],
      },
    ],
    checks: [
      {
        id: 'candidate',
        label: 'Candidate integrity',
        status: 'pass',
        detail: 'The candidate is intact.',
      },
      {
        id: 'budget',
        label: 'Budget hard limits',
        status: 'warning',
        detail: 'Token and cost limits are shadow-only.',
      },
      {
        id: 'git',
        label: 'Git baseline',
        status: 'blocked',
        detail: 'A pre-existing code change must be removed.',
      },
    ],
    evidence_refs: [
      {
        label: 'Approved candidate',
        path: `artifacts/${'nested/'.repeat(30)}test-plan.candidate.json`,
        sha256: 'b'.repeat(64),
      },
    ],
    actions: [
      {
        id: 'approve',
        label: 'Approve current plan',
        description: 'Approve the reviewed plan.',
        effect: 'Enter Pair.',
        tone: 'approve',
        reason_mode: 'optional',
        enabled: false,
        disabled_reason: 'Git baseline is blocked.',
      },
      {
        id: 'revise',
        label: 'Revise the plan',
        description: 'Route plan feedback.',
        effect: 'Remain in Tasking.',
        tone: 'feedback',
        reason_mode: 'required',
        enabled: true,
      },
    ],
    ...overrides,
  };
}

describe('Decision Packet renderer', () => {
  it.each([60, 80, 120])(
    'wraps long Unicode, paths, and commands within %s columns',
    (width) => {
      const viewport = renderDecisionPacketViewport(packet(), {
        width,
        height: 1_000,
      });

      expect(viewport.lines.length).toBeGreaterThan(10);
      expect(
        viewport.lines.every(({ text }) => visibleWidth(text) <= width),
      ).toBe(true);
    },
  );

  it('retains status words and non-authoritative semantics without color', () => {
    const text = renderDecisionPacketReview(packet())
      .map((line) => line.text)
      .join('\n');

    expect(text).toContain('READ-ONLY PROJECTION · NOT AN AUTHORITY ARTIFACT');
    expect(text).toContain('PASS · Candidate integrity');
    expect(text).toContain('WARNING · Budget hard limits');
    expect(text).toContain('BLOCKED · Git baseline');
    expect(text).toContain('INCLUDE ·');
    expect(text).toContain('EXCLUDE ·');
  });

  it('makes every omitted entry and complete artifact path explicit', () => {
    const bounded = boundDecisionList(
      ['command 1', 'command 2', 'command 3', 'command 4'],
      2,
      'artifacts/04-planning/test-plan.candidate.json',
    );

    expect(bounded).toEqual({
      shown: ['command 1', 'command 2'],
      omitted_count: 2,
      omission_notice:
        '2 item(s) omitted; review the complete artifact: artifacts/04-planning/test-plan.candidate.json',
    });
  });

  it('pages review details with clamped offsets', () => {
    const first = renderDecisionPacketViewport(packet(), {
      width: 60,
      height: 8,
    });
    const last = renderDecisionPacketViewport(packet(), {
      width: 60,
      height: 8,
      offset: 100_000,
    });

    expect(first).toMatchObject({
      offset: 0,
      visible_lines: 8,
      has_above: false,
      has_below: true,
    });
    expect(last.offset).toBe(last.total_lines - 8);
    expect(last.has_above).toBe(true);
    expect(last.has_below).toBe(false);
  });

  it('fails closed when rendered review text exceeds 16 KiB', () => {
    const oversized = packet({
      sections: Array.from({ length: 5 }, (_, sectionIndex) => ({
        id: `section-${sectionIndex}`,
        title: `Section ${sectionIndex}`,
        items: Array.from({ length: 2 }, (_, itemIndex) => ({
          label: `Item ${sectionIndex}-${itemIndex}`,
          value: 'x'.repeat(1_900),
        })),
      })),
    });

    expect(() => renderDecisionPacketReview(oversized)).toThrow(
      'rendered bytes',
    );
  });
});
