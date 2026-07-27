export type TaskingFunctionalContext =
  | 'workspace'
  | 'work-intake'
  | 'delivery'
  | 'logical-model'
  | 'diagram-projection'
  | 'model-proposal';

export type TaskingTechnicalBoundary =
  | 'react-route'
  | 'react-feature'
  | 'rest-client'
  | 'http-server'
  | 'nest-api'
  | 'nest-domain'
  | 'prisma-store'
  | 'electron-main'
  | 'electron-preload'
  | 'desktop-binding-store'
  | 'git-worktree'
  | 'webview';

export type TaskingTestDouble = 'fake' | 'stub' | 'spy' | 'mock';

export interface TaskingProcessStepDefinition {
  id: string;
  quadrant: 'Q1' | 'Q2';
  purpose: string;
  red: {
    expectedFailureKind: 'behavior';
    expectedFailure: string;
  };
  greenDoneWhen: string;
  refactorDoneWhen: string;
  functionalContexts: TaskingFunctionalContext[];
  realBoundaries: TaskingTechnicalBoundary[];
  replacedBoundaries: Array<{
    boundary: TaskingTechnicalBoundary;
    testDouble: TaskingTestDouble;
  }>;
  nearestTestRoots: string[];
  focusedCommandTemplate: string;
  requiresProject: boolean;
}

export interface TaskingQualityGateDefinition {
  scope: 'test_projects' | 'planned_projects' | 'process';
  requiredTarget?: string;
  commandTemplate: string;
}

export interface PairExecutionPolicyDefinition {
  id: 'pair-default';
  version: 2;
  activityTimeoutMs: number;
  commandTimeoutMs: number;
  baseAgentCalls: number;
  agentCallsPerTest: number;
  agentCallsPerStep: number;
  baseCheckpoints: number;
  checkpointsPerTest: number;
  checkpointsPerStep: number;
  checkpointsPerGate: number;
  maxRetriesPerFingerprint: number;
  maxNoProgressCheckpoints: number;
}

export interface TaskingProcessDefinition {
  version: 3;
  id: string;
  owner: string;
  runtime: 'typescript';
  functionalContexts: TaskingFunctionalContext[];
  technicalBoundaries: TaskingTechnicalBoundary[];
  appliesWhen: string;
  steps: TaskingProcessStepDefinition[];
  qualityGates: TaskingQualityGateDefinition[];
}

export const PAIR_EXECUTION_POLICY: PairExecutionPolicyDefinition = {
  id: 'pair-default',
  version: 2,
  activityTimeoutMs: 3_600_000,
  commandTimeoutMs: 600_000,
  baseAgentCalls: 4,
  agentCallsPerTest: 3,
  agentCallsPerStep: 1,
  baseCheckpoints: 8,
  checkpointsPerTest: 6,
  checkpointsPerStep: 3,
  checkpointsPerGate: 2,
  maxRetriesPerFingerprint: 2,
  maxNoProgressCheckpoints: 3,
};

export const TASKING_FUNCTIONAL_CONTEXTS: TaskingFunctionalContext[] = [
  'workspace',
  'work-intake',
  'delivery',
  'logical-model',
  'diagram-projection',
  'model-proposal',
];

const PROJECT_GATES: TaskingQualityGateDefinition[] = [
  {
    scope: 'test_projects',
    requiredTarget: 'test',
    commandTemplate: 'pnpm nx test {{project}} --run',
  },
  {
    scope: 'planned_projects',
    requiredTarget: 'typecheck',
    commandTemplate: 'pnpm nx typecheck {{project}}',
  },
  {
    scope: 'planned_projects',
    requiredTarget: 'lint',
    commandTemplate: 'pnpm nx lint {{project}}',
  },
];

export const TASKING_PROCESS_CATALOG: TaskingProcessDefinition[] = [
  {
    version: 3,
    id: 'typescript-nest-feature',
    owner: 'server-platform',
    runtime: 'typescript',
    functionalContexts: TASKING_FUNCTIONAL_CONTEXTS,
    technicalBoundaries: ['nest-domain', 'prisma-store', 'nest-api'],
    appliesWhen:
      'The Scenario changes the canonical Nest domain, PostgreSQL persistence, or REST/HAL API.',
    steps: [
      {
        id: 'nest-domain-q1',
        quadrant: 'Q1',
        purpose: 'Drive the business rule through the isolated domain module.',
        red: {
          expectedFailureKind: 'behavior',
          expectedFailure:
            'The focused domain test reaches its assertion and fails because the planned business behavior is absent.',
        },
        greenDoneWhen:
          'The focused domain test passes with the minimum business behavior.',
        refactorDoneWhen:
          'The domain behavior is clear without changing the confirmed test outcome.',
        functionalContexts: TASKING_FUNCTIONAL_CONTEXTS,
        realBoundaries: ['nest-domain'],
        replacedBoundaries: [],
        nearestTestRoots: ['libs/server/domain/src'],
        focusedCommandTemplate:
          'pnpm nx test {{project}} --run --testNamePattern={{test_filter}}',
        requiresProject: true,
      },
      {
        id: 'nest-persistent-q1',
        quadrant: 'Q1',
        purpose: 'Drive repository behavior behind the persistence boundary.',
        red: {
          expectedFailureKind: 'behavior',
          expectedFailure:
            'The focused persistence test reaches its repository assertion and fails because the planned behavior is absent.',
        },
        greenDoneWhen:
          'The focused persistence test passes through the approved repository boundary.',
        refactorDoneWhen:
          'The repository change is minimal and preserves the confirmed behavior.',
        functionalContexts: TASKING_FUNCTIONAL_CONTEXTS,
        realBoundaries: ['nest-domain'],
        replacedBoundaries: [{ boundary: 'prisma-store', testDouble: 'fake' }],
        nearestTestRoots: ['libs/server/persistent/src'],
        focusedCommandTemplate:
          'pnpm nx test {{project}} --run --testNamePattern={{test_filter}}',
        requiresProject: true,
      },
      {
        id: 'nest-api-q2',
        quadrant: 'Q2',
        purpose: 'Confirm the Scenario through the composed Nest API.',
        red: {
          expectedFailureKind: 'behavior',
          expectedFailure:
            'The focused API test reaches its observable response assertion and fails because the Scenario outcome is absent.',
        },
        greenDoneWhen:
          'The focused API test observes the confirmed Scenario outcome.',
        refactorDoneWhen:
          'The composed API path remains minimal and preserves the confirmed response.',
        functionalContexts: TASKING_FUNCTIONAL_CONTEXTS,
        realBoundaries: ['nest-api', 'nest-domain'],
        replacedBoundaries: [{ boundary: 'prisma-store', testDouble: 'fake' }],
        nearestTestRoots: ['apps/server/src', 'libs/server/api/src'],
        focusedCommandTemplate:
          'pnpm nx test {{project}} --run --testNamePattern={{test_filter}}',
        requiresProject: true,
      },
    ],
    qualityGates: PROJECT_GATES,
  },
  {
    version: 3,
    id: 'typescript-web-feature',
    owner: 'web-platform',
    runtime: 'typescript',
    functionalContexts: TASKING_FUNCTIONAL_CONTEXTS,
    technicalBoundaries: [
      'react-route',
      'react-feature',
      'rest-client',
      'http-server',
    ],
    appliesWhen:
      'The Scenario changes the shared React Web/Desktop frontend or REST client.',
    steps: [
      {
        id: 'web-feature-q1',
        quadrant: 'Q1',
        purpose: 'Drive feature behavior from the nearest component test.',
        red: {
          expectedFailureKind: 'behavior',
          expectedFailure:
            'The focused component test reaches its user-visible assertion and fails because the planned behavior is absent.',
        },
        greenDoneWhen:
          'The focused component test observes the planned user-visible behavior.',
        refactorDoneWhen:
          'The feature composition is clear without changing the confirmed behavior.',
        functionalContexts: TASKING_FUNCTIONAL_CONTEXTS,
        realBoundaries: ['react-feature'],
        replacedBoundaries: [{ boundary: 'rest-client', testDouble: 'stub' }],
        nearestTestRoots: ['libs/web', 'apps/web/src'],
        focusedCommandTemplate:
          'pnpm nx test {{project}} --run --testNamePattern={{test_filter}}',
        requiresProject: true,
      },
      {
        id: 'web-resource-q1',
        quadrant: 'Q1',
        purpose: 'Drive REST resource semantics while isolating transport.',
        red: {
          expectedFailureKind: 'behavior',
          expectedFailure:
            'The focused resource test reaches its HAL assertion and fails because the planned resource behavior is absent.',
        },
        greenDoneWhen:
          'The focused resource test passes with the approved HAL behavior.',
        refactorDoneWhen:
          'The resource boundary is minimal and preserves the confirmed contract.',
        functionalContexts: TASKING_FUNCTIONAL_CONTEXTS,
        realBoundaries: ['rest-client'],
        replacedBoundaries: [{ boundary: 'http-server', testDouble: 'mock' }],
        nearestTestRoots: ['libs/web'],
        focusedCommandTemplate:
          'pnpm nx test {{project}} --run --testNamePattern={{test_filter}}',
        requiresProject: true,
      },
      {
        id: 'web-acceptance-q2',
        quadrant: 'Q2',
        purpose: 'Confirm the Scenario through route and feature composition.',
        red: {
          expectedFailureKind: 'behavior',
          expectedFailure:
            'The focused acceptance test reaches its route-level assertion and fails because the Scenario outcome is absent.',
        },
        greenDoneWhen:
          'The focused acceptance test observes the confirmed Scenario outcome.',
        refactorDoneWhen:
          'The route composition remains minimal and preserves the acceptance outcome.',
        functionalContexts: TASKING_FUNCTIONAL_CONTEXTS,
        realBoundaries: ['react-route', 'react-feature', 'rest-client'],
        replacedBoundaries: [{ boundary: 'http-server', testDouble: 'stub' }],
        nearestTestRoots: ['apps/web/src', 'libs/web'],
        focusedCommandTemplate:
          'pnpm nx test {{project}} --run --testNamePattern={{test_filter}}',
        requiresProject: true,
      },
    ],
    qualityGates: PROJECT_GATES,
  },
  {
    version: 3,
    id: 'typescript-electron-shell',
    owner: 'desktop-platform',
    runtime: 'typescript',
    functionalContexts: TASKING_FUNCTIONAL_CONTEXTS,
    technicalBoundaries: [
      'electron-main',
      'electron-preload',
      'desktop-binding-store',
      'git-worktree',
      'http-server',
      'webview',
    ],
    appliesWhen:
      'The Scenario changes Electron main/preload, local binding, worktree, or packaging behavior.',
    steps: [
      {
        id: 'electron-shell-q1',
        quadrant: 'Q1',
        purpose:
          'Drive Electron lifecycle and security without a live renderer.',
        red: {
          expectedFailureKind: 'behavior',
          expectedFailure:
            'The focused Electron test reaches its lifecycle or security assertion and fails because the planned behavior is absent.',
        },
        greenDoneWhen:
          'The focused Electron test passes with the minimum secure shell behavior.',
        refactorDoneWhen:
          'The Electron boundary remains least-privilege and preserves the confirmed test.',
        functionalContexts: TASKING_FUNCTIONAL_CONTEXTS,
        realBoundaries: ['electron-main', 'electron-preload'],
        replacedBoundaries: [
          { boundary: 'webview', testDouble: 'stub' },
          { boundary: 'http-server', testDouble: 'stub' },
        ],
        nearestTestRoots: ['apps/desktop/src'],
        focusedCommandTemplate:
          'pnpm nx test @evidence/desktop --run --testNamePattern={{test_filter}}',
        requiresProject: false,
      },
      {
        id: 'electron-package-q2',
        quadrant: 'Q2',
        purpose: 'Confirm the Scenario through the packaged Electron runtime.',
        red: {
          expectedFailureKind: 'behavior',
          expectedFailure:
            'The focused package test reaches its packaged-runtime assertion and fails because the Scenario outcome is absent.',
        },
        greenDoneWhen:
          'The focused package test observes the confirmed packaged-runtime outcome.',
        refactorDoneWhen:
          'The packaged boundary remains minimal and preserves the acceptance outcome.',
        functionalContexts: TASKING_FUNCTIONAL_CONTEXTS,
        realBoundaries: ['electron-main', 'electron-preload', 'webview'],
        replacedBoundaries: [{ boundary: 'http-server', testDouble: 'stub' }],
        nearestTestRoots: ['apps/desktop/scripts', 'apps/desktop/src'],
        focusedCommandTemplate:
          'pnpm nx test @evidence/desktop --run --testNamePattern={{test_filter}}',
        requiresProject: false,
      },
    ],
    qualityGates: [
      ...PROJECT_GATES,
      {
        scope: 'process',
        commandTemplate: 'pnpm nx run @evidence/desktop:package-smoke',
      },
    ],
  },
];
