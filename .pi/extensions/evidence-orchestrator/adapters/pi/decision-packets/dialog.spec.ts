import { visibleWidth } from '@earendil-works/pi-tui';
import { describe, expect, it, vi } from 'vitest';
import type { HumanDecisionPacket } from './contract';
import { showDecisionPacket } from './dialog';

type Action = 'approve' | 'revise';

interface TestComponent {
  render(width: number): string[];
  handleInput(data: string): void;
  invalidate(): void;
  dispose(): void;
}

const keyMap = {
  'tui.select.up': ['move-up'],
  'tui.select.down': ['move-down'],
  'tui.select.pageUp': ['review-up'],
  'tui.select.pageDown': ['review-down'],
  'tui.select.confirm': ['choose'],
  'tui.select.cancel': ['abort', 'ctrl+c'],
} as const;

function packet(blocked = false): HumanDecisionPacket<Action> {
  return {
    version: 1,
    packet_kind: 'tasking_desk_check',
    iteration_id: 'ITER-0001',
    loop: 'Tasking',
    stage: 'Desk Check',
    title: 'Review one complete Story plan',
    authority_request: 'Approve the plan or route feedback.',
    authority_scope: ['Scenario through budget traceability'],
    authority_exclusions: ['Code and product value acceptance'],
    subject_label: 'DRAFT-001 · US-001 · SC-001',
    subject_sha256: 'a'.repeat(64),
    sections: Array.from({ length: 4 }, (_, sectionIndex) => ({
      id: `section-${sectionIndex}`,
      title: `Review section ${sectionIndex}`,
      items: Array.from({ length: 3 }, (_, itemIndex) => ({
        label: `Fact ${sectionIndex}-${itemIndex}`,
        value: `工作区审查事实 ${sectionIndex}-${itemIndex} ${'detail '.repeat(8)}`,
      })),
    })),
    checks: [
      {
        id: 'candidate',
        label: 'Candidate integrity',
        status: blocked ? 'blocked' : 'pass',
        detail: blocked
          ? 'Candidate evidence drifted.'
          : 'Candidate evidence is intact.',
      },
    ],
    evidence_refs: [
      {
        label: 'Candidate',
        path: 'artifacts/04-planning/test-plan.candidate.json',
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
        enabled: !blocked,
        ...(blocked
          ? { disabled_reason: 'Candidate integrity is blocked.' }
          : {}),
      },
      {
        id: 'revise',
        label: 'Revise the plan',
        description: 'Route feedback to Tasking.',
        effect: 'Remain in Tasking drafting.',
        tone: 'feedback',
        reason_mode: 'required',
        enabled: true,
      },
    ],
  };
}

function context(
  interact: (
    component: TestComponent,
    tui: { requestRender: ReturnType<typeof vi.fn> },
  ) => void,
  mode = 'tui',
) {
  const requestRender = vi.fn();
  const custom = vi.fn(
    async (
      factory: (
        tui: { requestRender: typeof requestRender },
        theme: {
          fg: (color: string, text: string) => string;
          bold: (text: string) => string;
        },
        keybindings: {
          matches: (data: string, id: keyof typeof keyMap) => boolean;
          getKeys: (id: keyof typeof keyMap) => readonly string[];
        },
        done: (value: Action | null) => void,
      ) => TestComponent,
    ) => {
      let result: Action | null | undefined;
      const tui = { requestRender };
      const component = factory(
        tui,
        {
          fg: (_color, text) => text,
          bold: (text) => text,
        },
        {
          matches: (data, id) =>
            (keyMap[id] as readonly string[]).includes(data),
          getKeys: (id) => keyMap[id],
        },
        (value) => {
          result = value;
        },
      );
      interact(component, tui);
      return result;
    },
  );
  return {
    cwd: '/unused',
    mode,
    hasUI: true,
    ui: { custom },
    custom,
    requestRender,
  };
}

describe('Decision Packet dialog', () => {
  it('renders within narrow widths and selects safe cancellation first', async () => {
    const ctx = context((component) => {
      for (const width of [60, 80, 120]) {
        const lines = component.render(width);
        expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
      }
      expect(component.render(80).join('\n')).toContain(
        '→ 暂不决定（不写入任何状态）',
      );
      component.handleInput('choose');
    });

    await expect(
      showDecisionPacket(ctx as never, packet()),
    ).resolves.toBeNull();
  });

  it('uses injected keybindings to navigate and select an action', async () => {
    const ctx = context((component) => {
      component.handleInput('move-down');
      component.handleInput('choose');
    });

    await expect(showDecisionPacket(ctx as never, packet())).resolves.toBe(
      'approve',
    );
    expect(ctx.requestRender).toHaveBeenCalledTimes(1);
  });

  it.each(['abort', 'ctrl+c'])(
    'returns null for configured cancellation key %s',
    async (key) => {
      const ctx = context((component) => component.handleInput(key));
      await expect(
        showDecisionPacket(ctx as never, packet()),
      ).resolves.toBeNull();
    },
  );

  it('scrolls review details without moving the safe action selection', async () => {
    const ctx = context((component) => {
      const before = component.render(60).join('\n');
      component.handleInput('review-down');
      const after = component.render(60).join('\n');
      expect(after).not.toBe(before);
      component.handleInput('choose');
    });

    await expect(
      showDecisionPacket(ctx as never, packet()),
    ).resolves.toBeNull();
    expect(ctx.requestRender).toHaveBeenCalledTimes(1);
  });

  it('removes blocked approval from selectable actions but preserves feedback', async () => {
    const ctx = context((component) => {
      const rendered = component.render(80).join('\n');
      expect(rendered).toContain('Approval blocked');
      expect(rendered).not.toContain('→ Approve current plan');
      component.handleInput('move-down');
      component.handleInput('choose');
    });

    await expect(showDecisionPacket(ctx as never, packet(true))).resolves.toBe(
      'revise',
    );
  });

  it('invalidates safely and ignores input after disposal', async () => {
    const ctx = context((component) => {
      component.invalidate();
      expect(component.render(80).length).toBeGreaterThan(0);
      component.dispose();
      component.handleInput('move-down');
      component.handleInput('choose');
    });

    await expect(
      showDecisionPacket(ctx as never, packet()),
    ).resolves.toBeNull();
    expect(ctx.requestRender).not.toHaveBeenCalled();
  });

  it('fails closed outside TUI mode instead of invoking custom UI', async () => {
    const ctx = context(() => undefined, 'rpc');

    await expect(showDecisionPacket(ctx as never, packet())).rejects.toThrow(
      'requires TUI mode',
    );
    expect(ctx.custom).not.toHaveBeenCalled();
  });
});
