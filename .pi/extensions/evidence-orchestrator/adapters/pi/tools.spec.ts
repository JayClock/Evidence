import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE } from '../../iteration/default-state';
import { writeState } from '../../iteration/state-repository';
import { cleanupWorkspaces, workspace } from '../../test-support/support';
import { registerTools, syncActiveTools, toolsForState } from './tools';

afterEach(cleanupWorkspaces);

describe('tools', () => {
  it('registers native activity, proposal, TQA, and status tools only', () => {
    const tools: Array<{ name: string }> = [];
    registerTools({
      on() {
        return undefined;
      },
      registerTool(tool: { name: string }) {
        tools.push(tool);
      },
    } as never);

    const names = tools.map(({ name }) => name);
    expect(names).toEqual([
      'evidence_orchestrator_start_from_issue',
      'evidence_orchestrator_sync_issue',
      'evidence_orchestrator_status',
      'evidence_orchestrator_propose_kickoff',
      'evidence_orchestrator_run_activity',
      'evidence_orchestrator_propose_scenarios',
      'evidence_orchestrator_propose_modeling_profile',
      'evidence_orchestrator_record_model_analysis',
      'evidence_orchestrator_record_model_challenge',
      'evidence_orchestrator_propose_tasking',
      'evidence_orchestrator_record_showcase_review',
      'evidence_orchestrator_propose_response',
      'evidence_orchestrator_ask_question',
      'evidence_orchestrator_answer_question',
    ]);
  });

  it('exposes only tools owned by the current loop and stage', () => {
    expect(toolsForState(undefined)).toEqual([
      'evidence_orchestrator_start_from_issue',
      'evidence_orchestrator_status',
    ]);
    expect(toolsForState(DEFAULT_STATE)).toEqual([
      'evidence_orchestrator_start_from_issue',
      'evidence_orchestrator_status',
      'evidence_orchestrator_run_activity',
      'evidence_orchestrator_sync_issue',
      'evidence_orchestrator_propose_kickoff',
    ]);
    expect(
      toolsForState({
        ...DEFAULT_STATE,
        loop: 'understand',
        understand_stage: 'tqa',
      }),
    ).toEqual([
      'evidence_orchestrator_start_from_issue',
      'evidence_orchestrator_status',
      'evidence_orchestrator_run_activity',
      'evidence_orchestrator_ask_question',
      'evidence_orchestrator_answer_question',
      'evidence_orchestrator_propose_scenarios',
    ]);
  });

  it('preserves tools owned by Pi and other extensions when changing stage', () => {
    const setActiveTools = vi.fn();
    syncActiveTools(
      {
        getActiveTools: () => [
          'read',
          'other_extension_tool',
          'evidence_orchestrator_propose_response',
        ],
        setActiveTools,
      } as never,
      DEFAULT_STATE,
    );

    expect(setActiveTools).toHaveBeenCalledWith([
      'read',
      'other_extension_tool',
      'evidence_orchestrator_start_from_issue',
      'evidence_orchestrator_status',
      'evidence_orchestrator_run_activity',
      'evidence_orchestrator_sync_issue',
      'evidence_orchestrator_propose_kickoff',
    ]);
  });

  it('records one unauthorized Kickoff candidate without creating a Story', async () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    let kickoff:
      | { execute: (...args: never[]) => Promise<unknown> }
      | undefined;
    registerTools({
      on() {
        return undefined;
      },
      registerTool(tool: {
        name: string;
        execute: (...args: never[]) => Promise<unknown>;
      }) {
        if (tool.name === 'evidence_orchestrator_propose_kickoff')
          kickoff = tool;
      },
    } as never);

    const result = (await kickoff?.execute(
      'call' as never,
      {
        title: 'Confirm current model',
        problem: 'The current version is unclear.',
        role: 'modeling lead',
        goal: 'see the confirmed version',
        value: 'review the intended model',
        cognitiveMode: 'complex',
        sourceRefs: ['Issue #1'],
      } as never,
      undefined as never,
      undefined as never,
      { cwd } as never,
    )) as { terminate?: boolean; details?: { state?: unknown } };

    expect(result.terminate).toBe(true);
    expect(result.details?.state).toMatchObject({
      loop: 'kickoff',
      kickoff_candidate: { title: 'Confirm current model' },
    });
  });
});
