import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectCodeFiles, missingPaths } from './artifacts';
import { phaseModelConfig, readWorkflowConfig } from './config';
import { completePhase } from './gates';
import {
  validateDomainModelEvidence,
  validateScenarioExecutionEvidence,
} from './evidence';
import { DEFAULT_STATE, nextPhase, PHASE_META, PHASE_ORDER } from './phases';
import { registerCommands } from './commands';
import { registerTools } from './tools';
import { buildPhasePrompt } from './prompts';
import { readState, selectWorkItem, writeState } from './state';

const workspaces: string[] = [];

function workspace(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'evidence-workflow-'));
  workspaces.push(cwd);
  return cwd;
}

function write(cwd: string, path: string, content = 'content'): void {
  const absolute = join(cwd, path);
  mkdirSync(join(absolute, '..'), { recursive: true });
  writeFileSync(absolute, content);
}

function initializeGitRepository(cwd: string): void {
  write(cwd, '.gitignore', 'node_modules\n');
  execFileSync('git', ['init', '--quiet'], { cwd });
  execFileSync('git', ['add', '.gitignore'], { cwd });
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Evidence Workflow Test',
      '-c',
      'user.email=workflow@example.test',
      'commit',
      '--quiet',
      '-m',
      'initial',
    ],
    { cwd },
  );
}

afterEach(() => {
  for (const cwd of workspaces.splice(0)) {
    rmSync(cwd, { recursive: true, force: true });
  }
});

describe('phase model configuration', () => {
  it('loads an OpenAI model and reasoning level for each configured phase', () => {
    const cwd = workspace();
    write(
      cwd,
      '.pi/evidence-workflow.json',
      JSON.stringify({
        phaseModels: {
          coding: {
            provider: 'openai',
            model: 'gpt-5.6-terra',
            thinking: 'medium',
          },
        },
      }),
    );

    expect(phaseModelConfig(cwd, 'coding')).toEqual({
      provider: 'openai',
      model: 'gpt-5.6-terra',
      thinking: 'medium',
    });
    expect(phaseModelConfig(cwd, 'complete')).toBeUndefined();
  });

  it('rejects unsupported reasoning levels and obsolete phase names', () => {
    const cwd = workspace();
    write(
      cwd,
      '.pi/evidence-workflow.json',
      JSON.stringify({
        phaseModels: {
          review: {
            provider: 'openai',
            model: 'gpt-5.6-sol',
            thinking: 'ultra',
          },
        },
      }),
    );

    expect(() => readWorkflowConfig(cwd)).toThrow(
      'Invalid model configuration for phase review',
    );

    write(
      cwd,
      '.pi/evidence-workflow.json',
      JSON.stringify({
        phaseModels: {
          requirements: {
            provider: 'openai',
            model: 'gpt-5.6-sol',
            thinking: 'high',
          },
        },
      }),
    );

    expect(() => readWorkflowConfig(cwd)).toThrow(
      'Unsupported Evidence Workflow phase: requirements',
    );
  });
});

describe('Evidence workflow monorepo discovery', () => {
  it('collects apps and libs code while excluding generated output', () => {
    const cwd = workspace();
    write(cwd, 'apps/web/src/app.tsx');
    write(cwd, 'apps/web/out-tsc/app.js');
    write(cwd, 'apps/server/target/debug/generated.rs');
    write(cwd, 'libs/web/ui/src/button.spec.tsx');

    expect(collectCodeFiles(cwd)).toEqual([
      'apps/web/src/app.tsx',
      'libs/web/ui/src/button.spec.tsx',
    ]);
  });

  it('treats missing and empty required directories as missing', () => {
    const cwd = workspace();
    mkdirSync(join(cwd, 'artifacts/05-code'), { recursive: true });
    write(cwd, 'empty.md', '');

    expect(
      missingPaths(cwd, [
        'artifacts/05-code/',
        'apps/',
        'empty.md',
        'missing.md',
      ]),
    ).toEqual(['artifacts/05-code/', 'apps/', 'empty.md', 'missing.md']);
  });
});

describe('P0 knowledge-feedback workflow', () => {
  it('starts a new iteration with frame, clarification, specification, and validation', () => {
    expect(PHASE_ORDER.slice(0, 4)).toEqual([
      'frame',
      'clarify',
      'specify',
      'validate',
    ]);
    expect(DEFAULT_STATE.phase).toBe('frame');
    expect(PHASE_META.frame.gateId).toBe('GATE-101-frame');
    expect(PHASE_META.clarify.outputs).toContain(
      'artifacts/01-requirements/clarifications/',
    );
    expect(PHASE_META.specify.outputs).toContain(
      'artifacts/01-requirements/examples/',
    );
  });

  it('rejects an obsolete requirements phase instead of silently migrating it', () => {
    const cwd = workspace();
    write(
      cwd,
      'evidence-state.json',
      JSON.stringify({ ...DEFAULT_STATE, phase: 'requirements' }),
    );

    expect(() => readState(cwd)).toThrow(
      'Unsupported Evidence Workflow phase: requirements',
    );
  });

  it('requires TQA clarification and concrete examples in the requirement prompts', () => {
    const cwd = workspace();
    write(cwd, 'artifacts/00-user-input/requirements.md');
    writeState(cwd, { ...DEFAULT_STATE, phase: 'clarify' });

    expect(buildPhasePrompt(cwd)).toContain('TQA');
    writeState(cwd, { ...DEFAULT_STATE, phase: 'specify' });
    expect(buildPhasePrompt(cwd)).toContain('Given/When/Then');
  });

  it('requires a canonical .evidence model, model deltas, expansions, and test processes before implementation', () => {
    expect(PHASE_META.domain_model.outputs).toEqual(
      expect.arrayContaining([
        '.evidence/model.json',
        '.evidence/entities/',
        '.evidence/associations/',
        'artifacts/02-domain-model/model-snapshot.json',
        'artifacts/02-domain-model/model-delta.json',
        'artifacts/02-domain-model/model-expansions/',
        'artifacts/02-domain-model/tactical-design.md',
        'artifacts/02-domain-model/validation-report.md',
      ]),
    );
    expect(PHASE_META.domain_model.outputs).not.toContain(
      'artifacts/02-domain-model/entities-and-value-objects.md',
    );
    expect(PHASE_META.architecture.outputs).toEqual(
      expect.arrayContaining([
        'artifacts/03-architecture/test-strategy.md',
        'artifacts/03-architecture/test-processes/',
      ]),
    );
  });

  it('selects exactly one story scenario for the coding phase', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    writeState(cwd, { ...DEFAULT_STATE, phase: 'coding' });

    const state = selectWorkItem(cwd, 'US-042', 'SC-003');

    expect(state.active_work_item).toEqual(
      expect.objectContaining({
        story_id: 'US-042',
        scenario_id: 'SC-003',
        git_baseline: expect.any(String),
      }),
    );
    expect(buildPhasePrompt(cwd)).toContain('US-042 / SC-003');
  });

  it('adds a learning phase after review instead of completing immediately', () => {
    expect(PHASE_ORDER.at(-3)).toBe('review');
    expect(PHASE_ORDER.at(-2)).toBe('learn');
    expect(nextPhase('review')).toBe('learn');
    expect(PHASE_META.learn.outputs).toEqual([
      'artifacts/07-learning/iteration-summary.md',
      'artifacts/07-learning/next-iteration.md',
    ]);
  });

  it('loads command and tool registrations with the new workflow state types', () => {
    expect(registerCommands).toBeTypeOf('function');
    expect(registerTools).toBeTypeOf('function');
  });

  it('does not complete coding without scenario-specific evidence', () => {
    const cwd = workspace();
    writeState(cwd, {
      ...DEFAULT_STATE,
      phase: 'coding',
      active_work_item: {
        story_id: 'US-042',
        scenario_id: 'SC-003',
        git_baseline: 'abc123',
      },
    });
    write(cwd, 'apps/web/src/app.tsx');
    write(cwd, 'libs/web/ui/src/button.spec.tsx');
    write(cwd, 'artifacts/05-code/other.md');

    expect(() => completePhase(cwd, 'coding')).toThrow(
      'missing scenario evidence artifacts/05-code/US-042/SC-003.md',
    );
  });

  it('treats .evidence as the canonical project model and artifacts as snapshot, delta, and expansion evidence', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    write(
      cwd,
      '.evidence/model.json',
      JSON.stringify({
        version: 1,
        project_name: 'Evidence',
        purpose: 'Model the Evidence product domain for DDD iterations.',
      }),
    );
    write(
      cwd,
      '.evidence/entities/contract.yaml',
      'id: contract\nname: Contract\ntype: EVIDENCE\nsubType: other_evidence\n',
    );
    write(
      cwd,
      '.evidence/entities/request.yaml',
      'id: request\nname: Request\ntype: EVIDENCE\nsubType: fulfillment_request\n',
    );
    write(
      cwd,
      '.evidence/associations/contract-to-request.yaml',
      'id: contract-to-request\nkind: association\nname: ContractToRequest\nsource: contract\ntarget: request\n',
    );
    execFileSync('git', ['add', '.evidence'], { cwd });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Evidence Workflow Test',
        '-c',
        'user.email=workflow@example.test',
        'commit',
        '--quiet',
        '-m',
        'canonical model',
      ],
      { cwd },
    );
    const baseline = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
    }).trim();
    write(cwd, 'artifacts/01-requirements/examples/US-042-SC-003.md');
    write(
      cwd,
      'artifacts/02-domain-model/model-snapshot.json',
      JSON.stringify({
        version: 1,
        git_baseline: baseline,
        model_root: '.evidence/',
        included_paths: [
          '.evidence/entities/contract.yaml',
          '.evidence/entities/request.yaml',
          '.evidence/associations/contract-to-request.yaml',
        ],
      }),
    );
    write(
      cwd,
      'artifacts/02-domain-model/model-delta.json',
      JSON.stringify({
        version: 1,
        git_baseline: baseline,
        added: [],
        changed: [],
        removed: [],
        reason: 'The current model already explains the selected scenario.',
      }),
    );
    write(
      cwd,
      'artifacts/02-domain-model/model-expansions/US-042-SC-003.json',
      JSON.stringify({
        version: 1,
        work_item: { story_id: 'US-042', scenario_id: 'SC-003' },
        source_scenario: 'artifacts/01-requirements/examples/US-042-SC-003.md',
        model_refs: {
          entities: ['contract'],
          associations: ['contract-to-request'],
        },
        given: { entities: [], relationships: [] },
        when: { command: 'CreateDeliveryRequest' },
        then: {
          created_entities: ['DeliveryRequest'],
          changed_entities: [],
          created_relationships: ['Contract -> DeliveryRequest'],
          removed_relationships: [],
        },
        invariants: ['Contract exists before DeliveryRequest.'],
        timeline: ['Contract', 'DeliveryRequest'],
      }),
    );

    expect(() => validateDomainModelEvidence(cwd)).not.toThrow();
  });

  it('requires scenario execution evidence to prove Git changes, traceability, Red, Green, and Refactor', () => {
    const cwd = workspace();
    write(cwd, 'apps/web/src/app.tsx', 'export const app = 1;\n');
    write(cwd, 'libs/web/ui/src/index.ts', 'export {};\n');
    initializeGitRepository(cwd);
    execFileSync('git', ['add', 'apps', 'libs'], { cwd });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Evidence Workflow Test',
        '-c',
        'user.email=workflow@example.test',
        'commit',
        '--quiet',
        '-m',
        'baseline code',
      ],
      { cwd },
    );
    writeState(cwd, { ...DEFAULT_STATE, phase: 'coding' });
    const state = selectWorkItem(cwd, 'US-042', 'SC-003');
    const workItem = state.active_work_item;
    expect(workItem).toBeDefined();
    if (!workItem) throw new Error('Expected an active coding work item.');
    write(
      cwd,
      'artifacts/01-requirements/examples/US-042-SC-003.md',
      'Given a contract\nWhen a request is created\nThen it is linked\n',
    );
    write(cwd, 'apps/web/src/app.tsx', 'export const app = 2;\n');
    write(cwd, 'apps/web/src/app.spec.tsx', 'export {};\n');
    write(cwd, 'artifacts/05-code/US-042/SC-003.md', '# TDD evidence\n');
    write(
      cwd,
      'artifacts/05-code/US-042/SC-003.json',
      JSON.stringify({
        version: 1,
        work_item: {
          story_id: 'US-042',
          scenario_id: 'SC-003',
          git_baseline: workItem.git_baseline,
        },
        traceability: {
          scenario: 'artifacts/01-requirements/examples/US-042-SC-003.md',
          q2_tests: ['apps/web/src/app.spec.tsx'],
          q1_tests: ['apps/web/src/app.spec.tsx'],
          functional_contexts: ['web-shell'],
        },
        changed_code_paths: [
          'apps/web/src/app.tsx',
          'apps/web/src/app.spec.tsx',
        ],
        tdd: {
          red: {
            command: 'pnpm nx test @evidence/web --run',
            exit_code: 1,
            expected_failure: true,
          },
          green: { command: 'pnpm nx test @evidence/web --run', exit_code: 0 },
          refactor: {
            command: 'pnpm nx test @evidence/web --run',
            exit_code: 0,
          },
        },
      }),
    );

    expect(() =>
      validateScenarioExecutionEvidence(cwd, workItem),
    ).not.toThrow();
  });
});

describe('phase completion guardrails', () => {
  it('rejects completing a phase that is not current', () => {
    const cwd = workspace();
    writeState(cwd, { ...DEFAULT_STATE, phase: 'domain_model' });

    expect(() => completePhase(cwd, 'frame')).toThrow(
      'current phase is domain_model',
    );
  });

  it('rejects completion when required outputs are missing', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);

    expect(() => completePhase(cwd, 'frame')).toThrow(
      'missing required outputs',
    );
  });

  it('advances after required outputs exist and creates the configured gate', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    write(cwd, 'artifacts/01-requirements/personas.md');
    write(cwd, 'artifacts/01-requirements/problem-statement.md');
    write(cwd, 'artifacts/01-requirements/business-context.md');
    write(cwd, 'artifacts/01-requirements/user-journeys.md');
    write(cwd, 'artifacts/01-requirements/story-map.md');

    const state = completePhase(cwd, 'frame', 'ready');

    expect(state.phase).toBe('clarify');
    expect(state.pending_gate).toBeNull();
    expect(readState(cwd).artifacts).toHaveLength(5);
  });
});
