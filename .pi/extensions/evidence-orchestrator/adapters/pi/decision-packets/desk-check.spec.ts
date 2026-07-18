import { describe, expect, it, vi } from 'vitest';
import type { DeskCheckReview } from '../../../loops/tasking/public';
import { renderDecisionPacketReview } from './renderer';
import {
  buildDeskCheckDecisionPacket,
  promptDeskCheckDecision,
} from './desk-check';

function review(overrides: Partial<DeskCheckReview> = {}): DeskCheckReview {
  return {
    version: 1,
    iteration_id: 'ITER-0001',
    story_id: 'US-001',
    scenario_ids: ['SC-001'],
    draft_id: 'DRAFT-001',
    candidate_sha256: '1'.repeat(64),
    subject_sha256: 'a'.repeat(64),
    acceptance: {
      scenarios: [
        {
          scenario_id: 'SC-001',
          title: 'Create workspace Alpha',
          then: ['Workspace Alpha is available to the owner'],
          business_data: ['name=Alpha', 'owner=desktop-user'],
          artifact_path: 'artifacts/01-requirements/US-001-SC-001.md',
        },
      ],
    },
    model: {
      profile: 'tool/none',
      model_change_required: false,
      expansion_path: 'artifacts/02-domain-model/US-001-no-model.json',
      decision_path: 'artifacts/02-domain-model/US-001-no-model.json',
    },
    traceability: {
      scenario_outcome_count: 1,
      q1_count: 1,
      q2_count: 1,
      test_count: 2,
      task_count: 2,
      every_then_has_q2: true,
      every_test_has_one_task: true,
    },
    processes: [
      {
        id: 'typescript-web',
        runtime: 'typescript',
        process_version: 3,
        selected_step_ids: ['feature-q1', 'route-q2'],
        project_ids: ['@evidence/web'],
        functional_contexts: ['workspace'],
        technical_boundaries: ['react-feature'],
        focused_command_count: 2,
        quality_gate_count: 3,
        definition_sha256: '2'.repeat(64),
        materialized_sha256: '3'.repeat(64),
        project_catalog_sha256: '4'.repeat(64),
        path: 'engineering/evidence-orchestrator/test-processes/web.json',
      },
    ],
    commands: {
      focused: Array.from(
        { length: 7 },
        (_, index) => `pnpm nx test @evidence/web --run focused-${index}`,
      ),
      quality_gates: Array.from(
        { length: 7 },
        (_, index) => `pnpm nx lint @evidence/web gate-${index}`,
      ),
    },
    budget_preview: {
      policy_path: 'engineering/evidence-orchestrator/execution-budget.json',
      policy_sha256: '5'.repeat(64),
      mode: 'shadow',
      expected_pair_agent_calls: 8,
      max_pair_agent_calls: null,
      emergency_max_checkpoints: 200,
      max_retries_per_failure_fingerprint: 2,
      max_no_progress_checkpoints: null,
      activity_timeout_ms: 900_000,
      command_timeout_ms: 600_000,
      max_duration_ms: null,
      max_input_tokens: null,
      max_output_tokens: null,
      max_reported_cost_usd: null,
    },
    checks: [
      {
        id: 'candidate',
        status: 'pass',
        detail: 'Candidate and process materialization are intact.',
      },
      {
        id: 'model',
        status: 'pass',
        detail: 'No-model-impact evidence is intact.',
      },
      {
        id: 'git_baseline',
        status: 'pass',
        detail: 'Coding paths are clean.',
      },
      {
        id: 'budget_policy',
        status: 'warning',
        detail: 'Token and cost limits are shadow-only.',
      },
    ],
    evidence_refs: [
      {
        label: 'Tasking candidate',
        path: 'artifacts/04-planning/test-plan.candidate.json',
        sha256: '6'.repeat(64),
      },
      {
        label: 'Test list',
        path: 'artifacts/04-planning/test-list.md',
        sha256: '7'.repeat(64),
      },
      {
        label: 'Task list',
        path: 'artifacts/04-planning/task-list.md',
        sha256: '8'.repeat(64),
      },
      {
        label: 'Scenario SC-001',
        path: 'artifacts/01-requirements/US-001-SC-001.md',
        sha256: '9'.repeat(64),
      },
      {
        label: 'Model expansion',
        path: 'artifacts/02-domain-model/US-001-no-model.json',
        sha256: 'a'.repeat(64),
      },
      {
        label: 'Process typescript-web',
        path: 'engineering/evidence-orchestrator/test-processes/web.json',
        sha256: '2'.repeat(64),
      },
      {
        label: 'Execution budget policy',
        path: 'engineering/evidence-orchestrator/execution-budget.json',
        sha256: '5'.repeat(64),
      },
    ],
    ...overrides,
  };
}

function context(
  options: {
    input?: string;
    editor?: string;
    hasUI?: boolean;
    mode?: string;
  } = {},
) {
  return {
    cwd: '/workspace',
    mode: options.mode ?? 'tui',
    hasUI: options.hasUI ?? true,
    ui: {
      custom: vi.fn(),
      select: vi.fn(),
      input: vi.fn().mockResolvedValue(options.input),
      editor: vi.fn().mockResolvedValue(options.editor),
    },
  };
}

describe('Desk Check Decision Packet', () => {
  it('maps acceptance, model, process, commands, budget, and exact evidence', () => {
    const packet = buildDeskCheckDecisionPacket(review());
    const rendered = renderDecisionPacketReview(packet)
      .map(({ text }) => text)
      .join('\n');

    expect(packet.sections.map(({ id }) => id)).toEqual([
      'acceptance_boundary',
      'modeling_disposition',
      'test_task_shape',
      'runtime_process_ownership',
      'commands_gates',
      'execution_budget',
    ]);
    expect(rendered).toContain('SC-001 · Create workspace Alpha');
    expect(rendered).toContain('typescript-web');
    expect(rendered).toContain('2 item(s) omitted');
    expect(rendered).toContain('max=shadow');
    expect(rendered).not.toContain('unlimited');
    expect(packet.actions.find(({ id }) => id === 'approve')).toMatchObject({
      enabled: true,
      reason_mode: 'optional',
    });
  });

  it('sanitizes artifact text and disables approval for blockers', () => {
    const unsafe = review({
      acceptance: {
        scenarios: [
          {
            scenario_id: 'SC-001',
            title: 'Unsafe\u001b[31m title\u0001',
            then: ['Visible result'],
            business_data: ['name=Alpha'],
            artifact_path: 'scenario.md',
          },
        ],
      },
      checks: review().checks.map((check) =>
        check.id === 'candidate'
          ? { ...check, status: 'blocked', detail: 'Drift\u001b[31m found' }
          : check,
      ),
    });

    const packet = buildDeskCheckDecisionPacket(unsafe);
    const serialized = JSON.stringify(packet);

    expect(serialized).not.toContain('\u001b');
    expect(serialized).not.toContain('\u0001');
    expect(packet.actions.find(({ id }) => id === 'approve')).toMatchObject({
      enabled: false,
      disabled_reason: expect.stringContaining('BLOCKED'),
    });
    expect(packet.actions.find(({ id }) => id === 'revise')?.enabled).toBe(
      true,
    );
  });

  it('collects an optional approval reason and checks freshness last', async () => {
    const ctx = context({ input: '' });
    const inspect = vi.fn(() => review());
    const show = vi.fn().mockResolvedValue('approve');

    await expect(
      promptDeskCheckDecision(ctx as never, { inspect, show }),
    ).resolves.toEqual({ action: 'approve' });
    expect(ctx.ui.input).toHaveBeenCalledOnce();
    expect(inspect).toHaveBeenCalledTimes(2);
  });

  it('uses the built-in editor for required feedback reasons', async () => {
    const ctx = context({ editor: 'The process owner is ambiguous.' });
    const inspect = vi.fn(() => review());
    const show = vi.fn().mockResolvedValue('process_gap');

    await expect(
      promptDeskCheckDecision(ctx as never, { inspect, show }),
    ).resolves.toEqual({
      action: 'process_gap',
      reason: 'The process owner is ambiguous.',
    });
    expect(ctx.ui.editor).toHaveBeenCalledWith(
      expect.stringContaining('测试工序缺口'),
      expect.stringContaining('test process'),
    );
  });

  it('treats packet and reason cancellation as no decision', async () => {
    const packetCancel = context();
    const inspectPacket = vi.fn(() => review());
    await expect(
      promptDeskCheckDecision(packetCancel as never, {
        inspect: inspectPacket,
        show: vi.fn().mockResolvedValue(null),
      }),
    ).resolves.toBeUndefined();
    expect(inspectPacket).toHaveBeenCalledOnce();
    expect(packetCancel.ui.input).not.toHaveBeenCalled();

    const reasonCancel = context({ editor: undefined });
    await expect(
      promptDeskCheckDecision(reasonCancel as never, {
        inspect: vi.fn(() => review()),
        show: vi.fn().mockResolvedValue('revise'),
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects a stale subject after reason collection without returning authority', async () => {
    const ctx = context({ input: '' });
    const original = review();
    const changed = review({ subject_sha256: 'f'.repeat(64) });
    const inspect = vi
      .fn<(cwd: string) => DeskCheckReview>()
      .mockReturnValueOnce(original)
      .mockReturnValueOnce(changed);

    await expect(
      promptDeskCheckDecision(ctx as never, {
        inspect,
        show: vi.fn().mockResolvedValue('approve'),
      }),
    ).rejects.toThrow('No human decision was recorded');
  });

  it('requires UI or explicit arguments', async () => {
    const ctx = context({ hasUI: false });

    await expect(
      promptDeskCheckDecision(ctx as never, {
        inspect: vi.fn(() => review()),
        show: vi.fn(),
      }),
    ).rejects.toThrow('interactive mode or explicit command arguments');
  });
});
