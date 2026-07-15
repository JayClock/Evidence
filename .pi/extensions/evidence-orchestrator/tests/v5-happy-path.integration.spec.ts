import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { startIterationFromIssue } from '../capabilities/issue-source/github-issue-source';
import { proposeKickoffCandidate } from '../loops/kickoff/story-candidate';
import { decideKickoff } from '../loops/kickoff/story-decision';
import {
  answerClarification,
  askClarification,
} from '../loops/understand/tqa/conversation';
import {
  decideUnderstanding,
  proposeScenarioDrafts,
} from '../loops/understand/scenario/candidates';
import { recordModelAnalysis } from '../loops/understand/modeling/candidate-model';
import { recordModelChallenge } from '../loops/understand/modeling/challenge';
import {
  confirmModelingProfile,
  proposeModelingProfile,
} from '../loops/understand/modeling/profile';
import { decideTasking } from '../loops/tasking/desk-check';
import { proposeTaskingDraft } from '../loops/tasking/tasking-draft';
import {
  capturePairWorktree,
  completePairDriver,
  executePairAction,
  reviewPairRed,
} from '../testing/pairing';
import {
  decideShowcase,
  enterShowcase,
  executeShowcaseQ2,
  prepareShowcaseReview,
  recordShowcaseReview,
  recordShowcaseRisk,
} from '../testing/showcase';
import {
  decideKnowledgeResponse,
  proposeKnowledgeResponse,
} from '../evidence/respond';
import { readState } from '../iteration/state-repository';
import {
  cleanupWorkspaces,
  initializeGitRepository,
  workspace,
  write,
} from './support';

function issueRunner(args: string[]): string {
  if (args[0] === 'repo')
    return JSON.stringify({ nameWithOwner: 'owner/repo' });
  return JSON.stringify({
    number: 15,
    url: 'https://example.test/owner/repo/issues/15',
    title: 'Show the confirmed model version',
    body: 'A modeling lead needs to see which model version is current.',
    state: 'OPEN',
    author: { login: 'product-owner' },
    labels: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  });
}

function prepareProject(cwd: string): void {
  initializeGitRepository(cwd);
  for (const path of [
    'docs/product/personas.md',
    'docs/product/business-context.md',
    'docs/product/user-journeys.md',
    'docs/product/story-map.md',
    'docs/architecture/context-map.md',
    'docs/architecture/module-structure.md',
    'docs/architecture/tech-stack.md',
    'docs/architecture/test-strategy.md',
    'docs/architecture/test-doubles.md',
    'engineering/evidence-orchestrator/definition-of-done.md',
  ]) {
    write(cwd, path, `# ${path}\n`);
  }
  write(
    cwd,
    '.evidence/model.json',
    JSON.stringify({
      version: 1,
      project_name: 'Evidence',
      purpose: 'Model Evidence.',
    }),
  );
  write(
    cwd,
    '.evidence/entities/workspace.yaml',
    'id: workspace\nname: Workspace\ntype: CONTEXT\nsubType: bounded_context\n',
  );
  write(
    cwd,
    '.evidence/associations/workspace-self.yaml',
    'id: workspace-self\nname: Workspace Self\nsource: workspace\ntarget: workspace\nkind: association\n',
  );
  write(
    cwd,
    '.evidence/scenarios/REG-001.json',
    JSON.stringify({
      version: 1,
      id: 'REG-001',
      title: 'Workspace remains addressable',
      status: 'regression',
      model_refs: {
        entities: ['workspace'],
        associations: ['workspace-self'],
      },
      given: ['Workspace exists'],
      when: 'The workspace is opened',
      then: ['Workspace remains available'],
      business_data: ['workspace=alpha'],
      invariants: ['Workspace identity is stable'],
      timeline: ['Exists', 'Opened'],
    }),
  );
  write(
    cwd,
    'engineering/evidence-orchestrator/test-processes/web.json',
    JSON.stringify({
      version: 2,
      id: 'web-workspace',
      owner: 'web-platform',
      runtime: 'typescript',
      applies_to: {
        capabilities: ['workspace'],
        technical_boundaries: ['react-feature'],
        when: 'The Scenario is visible through Web.',
      },
      steps: [
        {
          id: 'component-q1',
          purpose: 'Localize the current-version rule.',
          quadrant: 'Q1',
          functional_contexts: ['workspace'],
          real_boundaries: ['react-feature'],
          replaced_boundaries: [],
          test_list_template: 'evidence-test-list-v1',
          nearest_test: {
            rule: 'Nearest feature test.',
            roots: ['apps/web/tests'],
          },
          focused_command: {
            template: 'node focused.js q1 {{test_filter}}',
            allowed_variables: ['test_filter'],
          },
          red: { expected_failure: 'Current-version rule fails.' },
          green: { done_when: 'Current-version rule passes.' },
          refactor: { done_when: 'Current-version rule remains green.' },
        },
        {
          id: 'acceptance-q2',
          purpose: 'Drive the confirmed visible behavior.',
          quadrant: 'Q2',
          functional_contexts: ['workspace'],
          real_boundaries: ['react-feature'],
          replaced_boundaries: [],
          test_list_template: 'evidence-test-list-v1',
          nearest_test: {
            rule: 'Nearest feature test.',
            roots: ['apps/web/tests'],
          },
          focused_command: {
            template: 'node focused.js q2 {{test_filter}}',
            allowed_variables: ['test_filter'],
          },
          red: { expected_failure: 'Current-version assertion fails.' },
          green: { done_when: 'Current-version assertion passes.' },
          refactor: { done_when: 'Current-version behavior remains green.' },
        },
      ],
      quality_gates: ['node quality.js'],
    }),
  );
  write(
    cwd,
    'focused.js',
    "const fs=require('node:fs'); const p=process.argv[2]==='q1'?'apps/web/src/model-state.ts':'apps/web/src/current-model.ts'; process.exit(fs.existsSync(p) ? 0 : 1);\n",
  );
  write(cwd, 'quality.js', 'process.exit(0);\n');
  execFileSync('git', ['add', '.'], { cwd });
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Evidence Orchestrator Test',
      '-c',
      'user.email=workflow@example.test',
      'commit',
      '--quiet',
      '-m',
      'project baseline',
    ],
    { cwd },
  );
}

afterEach(cleanupWorkspaces);

describe('native v5 full knowledge loop', () => {
  it('runs Issue snapshot through human-approved Respond without legacy phase controls', () => {
    const cwd = workspace();
    prepareProject(cwd);
    startIterationFromIssue(cwd, { issueNumber: 15 }, issueRunner);

    proposeKickoffCandidate(cwd, {
      title: 'Show the confirmed model version',
      problem: 'The modeling lead cannot tell which version is current.',
      role: 'modeling lead',
      goal: 'see the confirmed model version',
      value: 'review the intended model',
      cognitiveMode: 'complex',
      sourceRefs: ['GitHub Issue #15'],
    });
    decideKickoff(cwd, 'confirmed', 'This is one valuable Story.');

    askClarification(cwd, {
      story_id: 'US-001',
      question: 'Who decides which model version is current?',
      target: 'history',
    });
    answerClarification(cwd, 'The modeling lead confirms it.');
    proposeScenarioDrafts(cwd, 'US-001', [
      {
        title: 'Open the confirmed model',
        given: ['Model v3 is confirmed'],
        when: 'The modeling lead opens workspace Alpha',
        then: ['Model v3 is shown as current'],
        businessData: ['workspace=Alpha', 'version=v3'],
      },
    ]);
    decideUnderstanding(cwd, {
      action: 'confirmed',
      draftId: 'DRAFT-001',
      reason: 'This is the smallest observable value.',
    });

    proposeModelingProfile(cwd, {
      subject: 'domain',
      method: 'object',
      modelChangeRequired: false,
      reason: 'The current Workspace model explains the Scenario.',
    });
    confirmModelingProfile(cwd, {
      reason: 'The existing object model is sufficient.',
    });
    recordModelAnalysis(cwd, {
      reason: 'Workspace identity explains the current model view.',
      modelRefs: {
        entities: ['workspace'],
        associations: ['workspace-self'],
      },
      given: { entities: ['workspace'], relationships: ['workspace-self'] },
      when: 'Open workspace Alpha',
      then: {
        createdEntities: [],
        changedEntities: [],
        createdRelationships: [],
        removedRelationships: [],
      },
      invariants: ['The confirmed version is stable while opening'],
      timeline: ['v3 confirmed', 'workspace opened', 'v3 shown'],
      operations: [],
    });
    recordModelChallenge(cwd, {
      outcome: 'pass',
      summary: 'The Scenario and regression remain explainable.',
    });

    proposeTaskingDraft(cwd, {
      runtimes: [
        {
          id: 'RUNTIME-001',
          runtime: 'typescript',
          functionalContexts: ['workspace'],
          technicalBoundaries: ['react-feature'],
          testFilter: 'current_model',
        },
      ],
      tests: [
        {
          id: 'TEST-001',
          quadrant: 'Q1',
          intent: 'The confirmed current-version rule is exposed.',
          runtimePlanId: 'RUNTIME-001',
          stepId: 'component-q1',
          supportedBy: [],
          businessData: ['workspace=Alpha', 'version=v3'],
        },
        {
          id: 'TEST-002',
          quadrant: 'Q2',
          intent: 'Model v3 is shown as current.',
          runtimePlanId: 'RUNTIME-001',
          stepId: 'acceptance-q2',
          supportedBy: ['TEST-001'],
          scenarioOutcome: 'Model v3 is shown as current',
          businessData: ['workspace=Alpha', 'version=v3'],
        },
      ],
      tasks: [
        {
          id: 'TASK-001',
          description: 'Implement the confirmed current-version behavior.',
          testIds: ['TEST-001', 'TEST-002'],
          dependsOn: [],
        },
      ],
    });
    decideTasking(cwd, 'approve', 'The Q2 trace and process are correct.');

    const drivePairStep = (
      testPath: string,
      productionPath: string,
      summary: string,
    ) => {
      let snapshot = capturePairWorktree(cwd);
      write(
        cwd,
        testPath,
        `it('${summary}', () => { expect('v3').toBe('v3'); });\n`,
      );
      completePairDriver(cwd, 'test', snapshot, `Added ${summary} test.`);
      executePairAction(cwd, 'run_red');
      reviewPairRed(cwd, 'behavior', `${summary} is absent.`);

      snapshot = capturePairWorktree(cwd);
      write(cwd, productionPath, "export const current='v3';\n");
      completePairDriver(
        cwd,
        'implementation',
        snapshot,
        `Implemented ${summary}.`,
      );
      executePairAction(cwd, 'run_green');

      snapshot = capturePairWorktree(cwd);
      completePairDriver(cwd, 'refactor', snapshot, 'No-op refactor.');
      executePairAction(cwd, 'run_refactor');
    };
    drivePairStep(
      'apps/web/tests/model-state.test.ts',
      'apps/web/src/model-state.ts',
      'current-version rule',
    );
    drivePairStep(
      'apps/web/tests/current-model.test.ts',
      'apps/web/src/current-model.ts',
      'current model Q2',
    );
    executePairAction(cwd, 'run_quality_gate');

    enterShowcase(cwd);
    executeShowcaseQ2(cwd);
    recordShowcaseRisk(
      cwd,
      'Q3',
      'not_required',
      [],
      'No additional usability risk for this bounded behavior.',
    );
    recordShowcaseRisk(
      cwd,
      'Q4',
      'not_required',
      [],
      'No additional non-functional risk for this bounded behavior.',
    );
    prepareShowcaseReview(cwd);
    recordShowcaseReview(cwd, {
      observedFacts: ['The selected Q2 exits zero and displays version v3.'],
      productDomainFeedback: [],
      technicalQualityFeedback: [],
      unresolvedAssumptions: [],
      recommendation: 'accept',
    });
    decideShowcase(cwd, 'accept', 'The Scenario value is demonstrated.');

    const state = readState(cwd);
    if (!state.confirmed_scenario) throw new Error('Scenario is missing.');
    const manifest = `artifacts/iterations/ITER-0001/05-code/US-001/SC-001.manifest.json`;
    proposeKnowledgeResponse(cwd, {
      promotions: [],
      noPromotionReason:
        'The Scenario validated existing knowledge without a reusable knowledge change.',
      observedOutcomes: ['Model v3 is shown as current.'],
      residualRisks: [],
      nextProbe: {
        question: 'How should collaborators recognize a superseded version?',
        why_now: 'The current-version behavior is now proven.',
        evidence_refs: [state.confirmed_scenario.artifact_path, manifest],
        first_action:
          'Ask the modeling lead for one superseded-version example.',
      },
    });
    const completed = decideKnowledgeResponse(
      cwd,
      'approve',
      'The no-op promotion and next Probe match the evidence.',
    );

    expect(completed).toMatchObject({
      workflow_version: 5,
      loop: 'complete',
      respond_stage: 'complete',
    });
    expect(completed).not.toHaveProperty('phase');
    expect(existsSync(`${cwd}/${manifest}`)).toBe(true);
    expect(completed.knowledge_promotion_path).toBeTruthy();
  }, 15_000);
});
