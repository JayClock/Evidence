import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectCodeFiles, missingPaths } from './artifacts';
import { answerClarification, askClarification } from './clarifications';
import { phaseModelConfig, readWorkflowConfig } from './config';
import {
  answerGate,
  completePhase,
  recordPhaseFailure,
  resolvePendingGate,
} from './gates';
import {
  validateDomainModelEvidence,
  validateScenarioExecutionEvidence,
} from './evidence';
import { artifactRelativePath, iterationRoot } from './iteration';
import { DEFAULT_STATE, nextPhase, PHASE_META, PHASE_ORDER } from './phases';
import { registerCommands } from './commands';
import { registerTools } from './tools';
import { buildPhasePrompt } from './prompts';
import {
  newIterationState,
  readState,
  selectTestProcess,
  selectWorkItem,
  writeState,
} from './state';
import { validateWorkflow } from './validate';

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

function writeIterationArtifact(
  cwd: string,
  path: string,
  content = 'content',
): void {
  write(cwd, `artifacts/iterations/ITER-0001/${path}`, content);
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
      'select one matching test process before changing code',
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
    writeIterationArtifact(
      cwd,
      '03-architecture/test-processes/web-shell.json',
      JSON.stringify({
        version: 1,
        id: 'web-shell',
        applies_to: {
          runtime: 'typescript',
          functional_contexts: ['web-shell'],
        },
        steps: [
          {
            id: 'component-q1',
            quadrant: 'Q1',
            functional_context: 'web-shell',
            test_double: 'stub',
            task: 'Test the shell component in isolation.',
          },
          {
            id: 'acceptance-q2',
            quadrant: 'Q2',
            functional_context: 'web-shell',
            test_double: 'real',
            task: 'Verify the acceptance behavior.',
          },
        ],
        quality_gates: ['pnpm nx test @evidence/web --run'],
      }),
    );
    selectWorkItem(cwd, 'US-042', 'SC-003');
    const state = selectTestProcess(cwd, 'typescript', ['web-shell']);
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
        work_item: workItem,
        traceability: {
          scenario: 'artifacts/01-requirements/examples/US-042-SC-003.md',
          q2_tests: ['apps/web/src/app.spec.tsx'],
          q1_tests: ['apps/web/src/app.spec.tsx'],
          functional_contexts: ['web-shell'],
        },
        test_process: {
          id: 'web-shell',
          path: 'artifacts/iterations/ITER-0001/03-architecture/test-processes/web-shell.json',
          steps: [
            {
              id: 'component-q1',
              quadrant: 'Q1',
              functional_context: 'web-shell',
              test_double: 'stub',
              tests: ['apps/web/src/app.spec.tsx'],
              changed_code_paths: ['apps/web/src/app.spec.tsx'],
              tdd: {
                red: {
                  command: 'pnpm nx test @evidence/web --run',
                  exit_code: 1,
                  expected_failure: true,
                },
                green: {
                  command: 'pnpm nx test @evidence/web --run',
                  exit_code: 0,
                },
                refactor: {
                  command: 'pnpm nx test @evidence/web --run',
                  exit_code: 0,
                },
              },
            },
            {
              id: 'acceptance-q2',
              quadrant: 'Q2',
              functional_context: 'web-shell',
              test_double: 'real',
              tests: ['apps/web/src/app.spec.tsx'],
              changed_code_paths: ['apps/web/src/app.tsx'],
              tdd: {
                red: {
                  command: 'pnpm nx test @evidence/web --run',
                  exit_code: 1,
                  expected_failure: true,
                },
                green: {
                  command: 'pnpm nx test @evidence/web --run',
                  exit_code: 0,
                },
                refactor: {
                  command: 'pnpm nx test @evidence/web --run',
                  exit_code: 0,
                },
              },
            },
          ],
          quality_gates: [
            { command: 'pnpm nx test @evidence/web --run', exit_code: 0 },
          ],
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

describe('P2 executable test processes', () => {
  it('selects one schema-validated test process by runtime and functional contexts', () => {
    const cwd = workspace();
    initializeGitRepository(cwd);
    writeState(cwd, { ...DEFAULT_STATE, phase: 'coding' });
    writeIterationArtifact(
      cwd,
      '03-architecture/test-processes/rust-api.json',
      JSON.stringify({
        version: 1,
        id: 'rust-api',
        applies_to: {
          runtime: 'rust',
          functional_contexts: ['server-domain', 'server-api'],
        },
        steps: [
          {
            id: 'domain-q1',
            quadrant: 'Q1',
            functional_context: 'server-domain',
            test_double: 'real',
            task: 'Write a domain behavior test first.',
          },
          {
            id: 'api-q2',
            quadrant: 'Q2',
            functional_context: 'server-api',
            test_double: 'fake',
            task: 'Verify the acceptance scenario through the API.',
          },
        ],
        quality_gates: ['cargo test -p evidence-server'],
      }),
    );
    selectWorkItem(cwd, 'US-042', 'SC-003');

    const selected = selectTestProcess(cwd, 'rust', [
      'server-domain',
      'server-api',
    ]);

    expect(selected.active_work_item?.test_process).toEqual({
      id: 'rust-api',
      path: 'artifacts/iterations/ITER-0001/03-architecture/test-processes/rust-api.json',
      runtime: 'rust',
      functional_contexts: ['server-domain', 'server-api'],
    });
  });

  it('requires execution evidence to trace every selected process step and quality gate', () => {
    const cwd = workspace();
    write(cwd, 'apps/web/src/app.tsx', 'export const app = 1;\n');
    initializeGitRepository(cwd);
    execFileSync('git', ['add', 'apps'], { cwd });
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
    writeIterationArtifact(
      cwd,
      '03-architecture/test-processes/web-shell.json',
      JSON.stringify({
        version: 1,
        id: 'web-shell',
        applies_to: {
          runtime: 'typescript',
          functional_contexts: ['web-shell'],
        },
        steps: [
          {
            id: 'component-q1',
            quadrant: 'Q1',
            functional_context: 'web-shell',
            test_double: 'stub',
            task: 'Test the shell component in isolation.',
          },
          {
            id: 'acceptance-q2',
            quadrant: 'Q2',
            functional_context: 'web-shell',
            test_double: 'real',
            task: 'Verify the acceptance behavior.',
          },
        ],
        quality_gates: ['pnpm nx test @evidence/web --run'],
      }),
    );
    const workItem = selectWorkItem(cwd, 'US-042', 'SC-003').active_work_item!;
    const selected = selectTestProcess(cwd, 'typescript', [
      'web-shell',
    ]).active_work_item!;
    writeIterationArtifact(
      cwd,
      '01-requirements/examples/US-042-SC-003.md',
      'Given a workspace\nWhen it loads\nThen the shell is visible\n',
    );
    write(cwd, 'apps/web/src/app.tsx', 'export const app = 2;\n');
    write(cwd, 'apps/web/src/app.spec.tsx', 'export {};\n');
    writeIterationArtifact(cwd, '05-code/US-042/SC-003.md', '# TDD evidence\n');
    writeIterationArtifact(
      cwd,
      '05-code/US-042/SC-003.json',
      JSON.stringify({
        version: 1,
        work_item: { ...workItem, test_process: selected.test_process },
        traceability: {
          scenario:
            'artifacts/iterations/ITER-0001/01-requirements/examples/US-042-SC-003.md',
          q2_tests: ['apps/web/src/app.spec.tsx'],
          q1_tests: ['apps/web/src/app.spec.tsx'],
          functional_contexts: ['web-shell'],
        },
        test_process: {
          id: 'web-shell',
          path: 'artifacts/iterations/ITER-0001/03-architecture/test-processes/web-shell.json',
          steps: [
            {
              id: 'component-q1',
              quadrant: 'Q1',
              functional_context: 'web-shell',
              test_double: 'stub',
              tests: ['apps/web/src/app.spec.tsx'],
              changed_code_paths: ['apps/web/src/app.spec.tsx'],
              tdd: {
                red: {
                  command: 'pnpm nx test @evidence/web --run',
                  exit_code: 1,
                  expected_failure: true,
                },
                green: {
                  command: 'pnpm nx test @evidence/web --run',
                  exit_code: 0,
                },
                refactor: {
                  command: 'pnpm nx test @evidence/web --run',
                  exit_code: 0,
                },
              },
            },
            {
              id: 'acceptance-q2',
              quadrant: 'Q2',
              functional_context: 'web-shell',
              test_double: 'real',
              tests: ['apps/web/src/app.spec.tsx'],
              changed_code_paths: ['apps/web/src/app.tsx'],
              tdd: {
                red: {
                  command: 'pnpm nx test @evidence/web --run',
                  exit_code: 1,
                  expected_failure: true,
                },
                green: {
                  command: 'pnpm nx test @evidence/web --run',
                  exit_code: 0,
                },
                refactor: {
                  command: 'pnpm nx test @evidence/web --run',
                  exit_code: 0,
                },
              },
            },
          ],
          quality_gates: [
            { command: 'pnpm nx test @evidence/web --run', exit_code: 0 },
          ],
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
      validateScenarioExecutionEvidence(
        cwd,
        selected,
        'artifacts/iterations/ITER-0001',
      ),
    ).not.toThrow();
  });
});

describe('P1 TQA clarification workflow', () => {
  it('persists one pending clarification, routes its answer, and blocks clarification completion until answered', () => {
    const cwd = workspace();
    writeState(cwd, { ...DEFAULT_STATE, phase: 'clarify' });
    writeIterationArtifact(cwd, '01-requirements/business-context.md');
    writeIterationArtifact(cwd, '01-requirements/stories/US-042.md');

    const asked = askClarification(cwd, {
      story_id: 'US-042',
      question: '谁可以批准跨工作区共享的模型？',
      target: 'business_context',
    });
    expect(asked.pending_clarification).toEqual(
      expect.objectContaining({
        question_id: 'Q-001',
        story_id: 'US-042',
        target: 'business_context',
      }),
    );
    expect(() =>
      askClarification(cwd, {
        story_id: 'US-042',
        question: '第二个问题不应被接受。',
        target: 'story',
      }),
    ).toThrow('pending clarification Q-001');
    expect(() => completePhase(cwd, 'clarify')).toThrow(
      'pending clarification Q-001',
    );

    const answered = answerClarification(cwd, '仅工作区 Owner 可以批准。');
    expect(answered.pending_clarification).toBeUndefined();
    expect(answered.clarification_history).toEqual([
      expect.objectContaining({
        question_id: 'Q-001',
        answer: '仅工作区 Owner 可以批准。',
      }),
    ]);
    expect(
      readFileSync(
        join(
          cwd,
          'artifacts/iterations/ITER-0001/01-requirements/clarifications/US-042.json',
        ),
        'utf8',
      ),
    ).toContain('仅工作区 Owner 可以批准。');
    expect(
      readFileSync(
        join(
          cwd,
          'artifacts/iterations/ITER-0001/01-requirements/business-context.md',
        ),
        'utf8',
      ),
    ).toContain('Q-001');

    askClarification(cwd, {
      story_id: 'US-042',
      question: 'Owner 可以委派批准权限吗？',
      target: 'story',
    });
    answerClarification(cwd, '不可以，Owner 必须亲自批准。');
    expect(
      readFileSync(
        join(
          cwd,
          'artifacts/iterations/ITER-0001/01-requirements/stories/US-042.md',
        ),
        'utf8',
      ),
    ).toContain('Q-002');

    askClarification(cwd, {
      story_id: 'US-042',
      question: '该决定是否需要额外沉淀？',
      target: 'history',
    });
    answerClarification(cwd, '仅保留在本次澄清记录中。');
    expect(
      readFileSync(
        join(
          cwd,
          'artifacts/iterations/ITER-0001/01-requirements/clarifications/US-042.md',
        ),
        'utf8',
      ),
    ).toContain('Q-003');
  });

  it('requires clarification questions to be scoped to clarify and an existing story', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);

    expect(() =>
      askClarification(cwd, {
        story_id: 'US-042',
        question: '这不应在 frame 阶段提问。',
        target: 'history',
      }),
    ).toThrow('current phase is frame');

    writeState(cwd, { ...DEFAULT_STATE, phase: 'clarify' });
    expect(() =>
      askClarification(cwd, {
        story_id: 'US-042',
        question: '缺少故事。',
        target: 'history',
      }),
    ).toThrow('story artifact is missing');
  });
});

describe('P0 iteration isolation and PDCA', () => {
  it('resolves logical artifact paths into an immutable iteration namespace', () => {
    const cwd = workspace();
    const state = writeState(cwd, DEFAULT_STATE);

    expect(
      artifactRelativePath(state, 'artifacts/01-requirements/story-map.md'),
    ).toBe('artifacts/iterations/ITER-0001/01-requirements/story-map.md');
    expect(iterationRoot(cwd, state)).toBe(
      join(cwd, 'artifacts/iterations/ITER-0001'),
    );
    expect(buildPhasePrompt(cwd)).toContain(
      'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
    );
  });

  it('starts a new iteration without deleting a previous iteration root', () => {
    const cwd = workspace();
    writeIterationArtifact(
      cwd,
      '00-user-input/requirements.md',
      'existing seed',
    );
    writeState(cwd, DEFAULT_STATE);

    const next = newIterationState(cwd);

    expect(next.iteration_id).toBe('ITER-0002');
    expect(() => readState(cwd)).not.toThrow();
    expect(
      existsSync(
        join(
          cwd,
          'artifacts/iterations/ITER-0001/00-user-input/requirements.md',
        ),
      ),
    ).toBe(true);
  });

  it('applies typed gate decisions by approving, revising, or halting an iteration', () => {
    const cwd = workspace();
    writeState(cwd, {
      ...DEFAULT_STATE,
      gate_config: { ...DEFAULT_STATE.gate_config, frame: 'review' },
    });
    for (const output of PHASE_META.frame.outputs) {
      writeIterationArtifact(cwd, output.slice('artifacts/'.length));
    }
    const advanced = completePhase(cwd, 'frame', 'ready for review');
    expect(advanced.phase).toBe('clarify');
    expect(advanced.pending_gate).toBe('GATE-101-frame');

    answerGate(cwd, 'GATE-101-frame', 'revise: clarify the problem boundary');
    const revised = resolvePendingGate(cwd);
    expect(revised.phase).toBe('frame');
    expect(revised.pending_gate).toBeNull();
    expect(revised.round).toBe(1);

    completePhase(cwd, 'frame', 'revised');
    answerGate(cwd, 'GATE-101-frame', 'approve: scope is clear');
    expect(resolvePendingGate(cwd).phase).toBe('clarify');

    writeState(cwd, { ...readState(cwd), pending_gate: 'GATE-101-frame' });
    answerGate(cwd, 'GATE-101-frame', 'reject: stop this iteration');
    expect(resolvePendingGate(cwd).halted?.reason).toContain('reject');
  });

  it('records failed Check steps and creates an emergency gate at the retry limit', () => {
    const cwd = workspace();
    writeState(cwd, { ...DEFAULT_STATE, max_rounds: 2 });

    expect(
      recordPhaseFailure(cwd, 'frame', 'missing a user journey').round,
    ).toBe(1);
    const blocked = recordPhaseFailure(
      cwd,
      'frame',
      'still missing a user journey',
    );
    expect(blocked.pending_gate).toBe('GATE-EMERGENCY-frame');
    expect(readState(cwd).last_failure?.summary).toContain('still missing');

    answerGate(cwd, 'GATE-EMERGENCY-frame', 'approve: retry after workshop');
    const retried = resolvePendingGate(cwd);
    expect(retried.round).toBe(0);
    expect(retried.failures).toBe(0);
  });

  it('validates only the active iteration seed and state in CI', () => {
    const cwd = workspace();
    writeState(cwd, DEFAULT_STATE);
    writeIterationArtifact(cwd, '00-user-input/requirements.md', 'seed');
    write(cwd, 'artifacts/00-user-input/requirements.md', 'stale legacy seed');

    expect(() => validateWorkflow(cwd)).not.toThrow();
    write(
      cwd,
      'evidence-state.json',
      JSON.stringify({ ...DEFAULT_STATE, iteration_id: 'ITER-0002' }),
    );
    expect(() => validateWorkflow(cwd)).toThrow(
      'Active iteration artifact root is missing',
    );
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
    writeIterationArtifact(cwd, '01-requirements/personas.md');
    writeIterationArtifact(cwd, '01-requirements/problem-statement.md');
    writeIterationArtifact(cwd, '01-requirements/business-context.md');
    writeIterationArtifact(cwd, '01-requirements/user-journeys.md');
    writeIterationArtifact(cwd, '01-requirements/story-map.md');

    const state = completePhase(cwd, 'frame', 'ready');

    expect(state.phase).toBe('clarify');
    expect(state.pending_gate).toBeNull();
    expect(readState(cwd).artifacts).toHaveLength(5);
  });
});
