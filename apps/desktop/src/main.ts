import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  session,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import {
  CANCEL_DIAGRAM_AGENT_CHANNEL,
  DIAGRAM_AGENT_EVENT_CHANNEL,
  parseDiagramAgentRequest,
  RUN_DIAGRAM_AGENT_CHANNEL,
} from './agent-protocol';
import { authorizedApiRequestHeaders } from './electron/api-request-authorization';
import { IterationWorktreeManager } from './iteration-worktree';
import {
  captureOpenGitHubIssues,
  captureRepositoryMarkdown,
} from './inbox-source-adapters';
import {
  CANCEL_INBOX_ANALYST_CHANNEL,
  CANCEL_KICKOFF_ANALYST_CHANNEL,
  CANCEL_TASKING_ANALYST_CHANNEL,
  CANCEL_UNDERSTANDING_ANALYST_CHANNEL,
  FETCH_INBOX_GITHUB_ISSUES_CHANNEL,
  INTAKE_AGENT_EVENT_CHANNEL,
  parseFetchInboxGitHubIssuesRequest,
  parseReadInboxMarkdownRequest,
  parseStartIterationRequest,
  READ_INBOX_MARKDOWN_CHANNEL,
  RUN_INBOX_ANALYST_CHANNEL,
  RUN_KICKOFF_ANALYST_CHANNEL,
  RUN_TASKING_ANALYST_CHANNEL,
  RUN_UNDERSTANDING_ANALYST_CHANNEL,
  START_ITERATION_CHANNEL,
} from './intake-ipc-protocol';
import {
  parseInboxAnalystRequest,
  parseIntakeAgentEvent,
  parseKickoffAnalystRequest,
  parseTaskingAnalystRequest,
  parseUnderstandingAnalystRequest,
  type InboxAnalystRuntimeRequest,
  type IntakeAgentEvent,
  type KickoffAnalystRuntimeRequest,
  type TaskingAnalystRuntimeRequest,
  type UnderstandingAnalystRuntimeRequest,
} from './intake-agent-protocol';
import { IntakeApiClient } from './intake-api-client';
import { isTrustedRendererRequest } from './electron/ipc-security';
import { IterationController } from './iteration-controller';
import { LocalAgent } from './local-agent';
import {
  parsePairDriverEvent,
  type PairDriverEvent,
  type PairDriverRuntimeRequest,
} from './pair-agent-protocol';
import { PairApiClient } from './pair-api-client';
import { PairCheckpointStore } from './pair-checkpoint-store';
import { PairCommandRunner } from './pair-command-runner';
import { PairController, type PairControllerEvent } from './pair-controller';
import {
  APPROVE_PAIR_CHANNEL,
  CANCEL_PAIR_CHANNEL,
  DECIDE_PAIR_CHANNEL,
  PAIR_EVENT_CHANNEL,
  parseApprovePairRequest,
  parseDecidePairRequest,
  parsePairControllerEvent,
  parsePairRequestId,
  parseReviewPairRequest,
  parseRunPairRequest,
  RESUME_PAIR_CHANNEL,
  REVIEW_PAIR_CHANNEL,
  START_PAIR_CHANNEL,
} from './pair-ipc-protocol';
import {
  parsePairRedReviewerEvent,
  type PairRedReviewerEvent,
  type PairRedReviewerRuntimeRequest,
} from './pair-red-reviewer-protocol';
import { piRuntimeEnvironment } from './pi-runtime-environment';
import { RespondApiClient } from './respond-api-client';
import {
  RespondController,
  type RespondControllerEvent,
} from './respond-controller';
import {
  CANCEL_RESPOND_CHANNEL,
  parseRespondControllerEvent,
  parseRespondRequestId,
  parseRunRespondRequest,
  RESPOND_EVENT_CHANNEL,
  RUN_RESPOND_LEARNER_CHANNEL,
} from './respond-ipc-protocol';
import {
  parseRespondLearnerEvent,
  type RespondLearnerEvent,
  type RespondLearnerRuntimeRequest,
} from './respond-learner-protocol';
import { ShowcaseApiClient } from './showcase-api-client';
import {
  ShowcaseController,
  type ShowcaseControllerEvent,
} from './showcase-controller';
import {
  CANCEL_SHOWCASE_CHANNEL,
  parseRunShowcaseRequest,
  parseShowcaseControllerEvent,
  parseShowcaseRequestId,
  RUN_SHOWCASE_CHECKS_CHANNEL,
  RUN_SHOWCASE_REVIEWER_CHANNEL,
  SHOWCASE_EVENT_CHANNEL,
} from './showcase-ipc-protocol';
import {
  parseShowcaseReviewerEvent,
  type ShowcaseReviewerEvent,
  type ShowcaseReviewerRuntimeRequest,
} from './showcase-reviewer-protocol';
import {
  resolveApiAuthorization,
  resolveApiBaseUrl,
  resolveUserDataPath,
  resolveWebUrl,
} from './electron/runtime-config';
import { WorkspaceBindingStore } from './workspace-binding-store';

const APP_SCHEME = 'evidence';
const APP_URL = `${APP_SCHEME}://app/`;
const SMOKE_TEST = process.env.EVIDENCE_DESKTOP_SMOKE_TEST === '1';
const userDataPath = resolveUserDataPath();
if (userDataPath) app.setPath('userData', userDataPath);

let localAgent: LocalAgent | null = null;
let inboxAnalyst: LocalAgent<
  InboxAnalystRuntimeRequest,
  IntakeAgentEvent
> | null = null;
let kickoffAnalyst: LocalAgent<
  KickoffAnalystRuntimeRequest,
  IntakeAgentEvent
> | null = null;
let understandingAnalyst: LocalAgent<
  UnderstandingAnalystRuntimeRequest,
  IntakeAgentEvent
> | null = null;
let taskingAnalyst: LocalAgent<
  TaskingAnalystRuntimeRequest,
  IntakeAgentEvent
> | null = null;
let iterationController: IterationController | null = null;
let pairController: PairController | null = null;
let showcaseController: ShowcaseController | null = null;
let respondController: RespondController | null = null;
let allowQuit = false;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function packagedWebRoot(): string {
  return join(process.resourcesPath, 'web');
}

function resolveWebAsset(requestUrl: string): string {
  const webRoot = resolve(packagedWebRoot());
  const pathname = decodeURIComponent(new URL(requestUrl).pathname);
  const requested = resolve(webRoot, pathname.replace(/^\/+/, ''));
  const pathWithinRoot = relative(webRoot, requested);
  const isWithinRoot =
    pathWithinRoot === '' ||
    (!isAbsolute(pathWithinRoot) &&
      !pathWithinRoot.startsWith(`..${sep}`) &&
      pathWithinRoot !== '..');

  if (isWithinRoot && existsSync(requested) && statSync(requested).isFile()) {
    return requested;
  }
  return join(webRoot, 'index.html');
}

function registerWebProtocol(): void {
  protocol.handle(APP_SCHEME, (request) =>
    net.fetch(pathToFileURL(resolveWebAsset(request.url)).toString()),
  );
}

function expectedRendererUrl(): string {
  return app.isPackaged ? APP_URL : resolveWebUrl();
}

function assertTrustedIpcSender(event: IpcMainInvokeEvent): void {
  const senderFrame = event.senderFrame;
  const trusted = isTrustedRendererRequest({
    senderUrl: senderFrame?.url,
    expectedUrl: expectedRendererUrl(),
    isMainFrame: senderFrame === event.sender.mainFrame,
  });
  if (!trusted) {
    throw new Error('Rejected IPC request from an untrusted renderer.');
  }
}

function registerDesktopBridge(
  apiBaseUrl: string,
  agent: LocalAgent,
  bindings: WorkspaceBindingStore,
  inbox: LocalAgent<InboxAnalystRuntimeRequest, IntakeAgentEvent>,
  kickoff: LocalAgent<KickoffAnalystRuntimeRequest, IntakeAgentEvent>,
  understanding: LocalAgent<
    UnderstandingAnalystRuntimeRequest,
    IntakeAgentEvent
  >,
  tasking: LocalAgent<TaskingAnalystRuntimeRequest, IntakeAgentEvent>,
  iterations: IterationController,
  pairs: PairController,
  showcases: ShowcaseController,
  responds: RespondController,
): void {
  ipcMain.handle('evidence:get-api-base-url', (event) => {
    assertTrustedIpcSender(event);
    return apiBaseUrl;
  });
  ipcMain.handle('evidence:choose-repository', async (event) => {
    assertTrustedIpcSender(event);
    const selection = await dialog.showOpenDialog({
      title: 'Choose local Git repository',
      properties: ['openDirectory'],
    });
    const repositoryRoot = selection.filePaths[0];
    return selection.canceled || !repositoryRoot
      ? null
      : bindings.selectRepository(repositoryRoot, event.sender.id);
  });
  ipcMain.handle(
    'evidence:bind-workspace',
    async (event, input: unknown): Promise<void> => {
      assertTrustedIpcSender(event);
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('Workspace binding input is required.');
      }
      const candidate = input as Record<string, unknown>;
      if (
        typeof candidate.workspaceId !== 'string' ||
        typeof candidate.selectionId !== 'string'
      ) {
        throw new Error('Workspace binding input is invalid.');
      }
      await bindings.bindSelection({
        apiBaseUrl,
        workspaceId: candidate.workspaceId,
        selectionId: candidate.selectionId,
        ownerId: event.sender.id,
      });
    },
  );
  ipcMain.handle(READ_INBOX_MARKDOWN_CHANNEL, async (event, input: unknown) => {
    assertTrustedIpcSender(event);
    const request = parseReadInboxMarkdownRequest(input);
    const binding = await bindings.find(apiBaseUrl, request.workspaceId);
    if (!binding) {
      throw new Error('The Workspace is not bound to a local repository.');
    }
    return captureRepositoryMarkdown({
      repositoryRoot: binding.repositoryRoot,
      relativePath: request.relativePath,
    });
  });
  ipcMain.handle(
    FETCH_INBOX_GITHUB_ISSUES_CHANNEL,
    async (event, input: unknown) => {
      assertTrustedIpcSender(event);
      const request = parseFetchInboxGitHubIssuesRequest(input);
      const binding = await bindings.find(apiBaseUrl, request.workspaceId);
      if (!binding) {
        throw new Error('The Workspace is not bound to a local repository.');
      }
      return captureOpenGitHubIssues({
        repositoryRoot: binding.repositoryRoot,
      });
    },
  );
  ipcMain.handle(RUN_INBOX_ANALYST_CHANNEL, async (event, input: unknown) => {
    assertTrustedIpcSender(event);
    const request = parseInboxAnalystRequest(input);
    await inbox.run({ ...request, apiBaseUrl }, (agentEvent) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(INTAKE_AGENT_EVENT_CHANNEL, agentEvent);
      }
    });
  });
  ipcMain.handle(CANCEL_INBOX_ANALYST_CHANNEL, async (event, id: unknown) => {
    assertTrustedIpcSender(event);
    if (typeof id !== 'string') {
      throw new Error('Inbox Analyst request id is required.');
    }
    await inbox.cancel(id);
  });
  ipcMain.handle(RUN_KICKOFF_ANALYST_CHANNEL, async (event, input: unknown) => {
    assertTrustedIpcSender(event);
    const request = parseKickoffAnalystRequest(input);
    await kickoff.run({ ...request, apiBaseUrl }, (agentEvent) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(INTAKE_AGENT_EVENT_CHANNEL, agentEvent);
      }
    });
  });
  ipcMain.handle(CANCEL_KICKOFF_ANALYST_CHANNEL, async (event, id: unknown) => {
    assertTrustedIpcSender(event);
    if (typeof id !== 'string') {
      throw new Error('Kickoff Analyst request id is required.');
    }
    await kickoff.cancel(id);
  });
  ipcMain.handle(
    RUN_UNDERSTANDING_ANALYST_CHANNEL,
    async (event, input: unknown) => {
      assertTrustedIpcSender(event);
      const request = parseUnderstandingAnalystRequest(input);
      const sessionDirectory = join(
        app.getPath('userData'),
        'tqa-sessions',
        request.workspaceId,
        request.iterationId,
      );
      await understanding.run(
        { ...request, apiBaseUrl, sessionDirectory },
        (agentEvent) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(INTAKE_AGENT_EVENT_CHANNEL, agentEvent);
          }
        },
      );
    },
  );
  ipcMain.handle(
    CANCEL_UNDERSTANDING_ANALYST_CHANNEL,
    async (event, id: unknown) => {
      assertTrustedIpcSender(event);
      if (typeof id !== 'string') {
        throw new Error('Understanding Analyst request id is required.');
      }
      await understanding.cancel(id);
    },
  );
  ipcMain.handle(RUN_TASKING_ANALYST_CHANNEL, async (event, input: unknown) => {
    assertTrustedIpcSender(event);
    const request = parseTaskingAnalystRequest(input);
    const binding = await bindings.find(apiBaseUrl, request.workspaceId);
    if (!binding) {
      throw new Error('The Workspace is not bound to a local repository.');
    }
    const sessionDirectory = join(
      app.getPath('userData'),
      'tasking-sessions',
      request.workspaceId,
      request.iterationId,
    );
    const worktreeRoot = join(
      app.getPath('userData'),
      'iteration-worktrees',
      request.iterationId,
    );
    await tasking.run(
      {
        ...request,
        apiBaseUrl,
        sessionDirectory,
        repositoryRoot: binding.repositoryRoot,
        worktreeRoot,
      },
      (agentEvent) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(INTAKE_AGENT_EVENT_CHANNEL, agentEvent);
        }
      },
    );
  });
  ipcMain.handle(CANCEL_TASKING_ANALYST_CHANNEL, async (event, id: unknown) => {
    assertTrustedIpcSender(event);
    if (typeof id !== 'string') {
      throw new Error('Tasking Analyst request id is required.');
    }
    await tasking.cancel(id);
  });
  ipcMain.handle(START_ITERATION_CHANNEL, async (event, input: unknown) => {
    assertTrustedIpcSender(event);
    return iterations.start(parseStartIterationRequest(input));
  });
  const forwardPairEvent = (
    event: IpcMainInvokeEvent,
    pairEvent: PairControllerEvent,
  ) => {
    const validated = parsePairControllerEvent(pairEvent);
    if (!validated)
      throw new Error('Pair Controller emitted an invalid event.');
    if (!event.sender.isDestroyed()) {
      event.sender.send(PAIR_EVENT_CHANNEL, validated);
    }
  };
  ipcMain.handle(START_PAIR_CHANNEL, async (event, input: unknown) => {
    assertTrustedIpcSender(event);
    const request = parseRunPairRequest(input);
    return pairs.start(request, (pairEvent) =>
      forwardPairEvent(event, pairEvent),
    );
  });
  ipcMain.handle(RESUME_PAIR_CHANNEL, async (event, input: unknown) => {
    assertTrustedIpcSender(event);
    const request = parseRunPairRequest(input);
    return pairs.resume(request, (pairEvent) =>
      forwardPairEvent(event, pairEvent),
    );
  });
  ipcMain.handle(REVIEW_PAIR_CHANNEL, async (event, input: unknown) => {
    assertTrustedIpcSender(event);
    return pairs.review(parseReviewPairRequest(input));
  });
  ipcMain.handle(DECIDE_PAIR_CHANNEL, async (event, input: unknown) => {
    assertTrustedIpcSender(event);
    const request = parseDecidePairRequest(input);
    return pairs.decide(request, (pairEvent) =>
      forwardPairEvent(event, pairEvent),
    );
  });
  ipcMain.handle(APPROVE_PAIR_CHANNEL, async (event, input: unknown) => {
    assertTrustedIpcSender(event);
    return pairs.approve(parseApprovePairRequest(input));
  });
  ipcMain.handle(CANCEL_PAIR_CHANNEL, (event, id: unknown) => {
    assertTrustedIpcSender(event);
    pairs.cancel(parsePairRequestId(id));
  });
  ipcMain.handle(RUN_SHOWCASE_CHECKS_CHANNEL, async (event, input: unknown) => {
    assertTrustedIpcSender(event);
    const request = parseRunShowcaseRequest(input);
    const forward = (showcaseEvent: ShowcaseControllerEvent) => {
      const validated = parseShowcaseControllerEvent(showcaseEvent);
      if (!validated) {
        throw new Error('Showcase Controller emitted an invalid event.');
      }
      if (!event.sender.isDestroyed()) {
        event.sender.send(SHOWCASE_EVENT_CHANNEL, validated);
      }
    };
    return showcases.runChecks(request, forward);
  });
  ipcMain.handle(
    RUN_SHOWCASE_REVIEWER_CHANNEL,
    async (event, input: unknown) => {
      assertTrustedIpcSender(event);
      const request = parseRunShowcaseRequest(input);
      const forward = (showcaseEvent: ShowcaseControllerEvent) => {
        const validated = parseShowcaseControllerEvent(showcaseEvent);
        if (!validated) {
          throw new Error('Showcase Controller emitted an invalid event.');
        }
        if (!event.sender.isDestroyed()) {
          event.sender.send(SHOWCASE_EVENT_CHANNEL, validated);
        }
      };
      return showcases.runReviewer(request, forward);
    },
  );
  ipcMain.handle(CANCEL_SHOWCASE_CHANNEL, (event, id: unknown) => {
    assertTrustedIpcSender(event);
    showcases.cancel(parseShowcaseRequestId(id));
  });
  ipcMain.handle(RUN_RESPOND_LEARNER_CHANNEL, async (event, input: unknown) => {
    assertTrustedIpcSender(event);
    const request = parseRunRespondRequest(input);
    return responds.runLearner(
      request,
      (respondEvent: RespondControllerEvent) => {
        const validated = parseRespondControllerEvent(respondEvent);
        if (!validated) {
          throw new Error('Respond Controller emitted an invalid event.');
        }
        if (!event.sender.isDestroyed()) {
          event.sender.send(RESPOND_EVENT_CHANNEL, validated);
        }
      },
    );
  });
  ipcMain.handle(CANCEL_RESPOND_CHANNEL, (event, id: unknown) => {
    assertTrustedIpcSender(event);
    responds.cancel(parseRespondRequestId(id));
  });
  ipcMain.handle(RUN_DIAGRAM_AGENT_CHANNEL, async (event, input: unknown) => {
    assertTrustedIpcSender(event);
    const request = parseDiagramAgentRequest(input);
    await agent.run({ ...request, apiBaseUrl }, (agentEvent) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(DIAGRAM_AGENT_EVENT_CHANNEL, agentEvent);
      }
    });
  });
  ipcMain.handle(CANCEL_DIAGRAM_AGENT_CHANNEL, async (event, id: unknown) => {
    assertTrustedIpcSender(event);
    if (typeof id !== 'string') {
      throw new Error('Agent request id is required.');
    }
    await agent.cancel(id);
  });
}

function registerRendererApiAuthorization(
  apiBaseUrl: string,
  authorization: string | undefined,
): void {
  if (!authorization) {
    return;
  }
  const apiOriginPattern = `${new URL(apiBaseUrl).origin}/*`;
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: [apiOriginPattern] },
    (details, callback) => {
      callback({
        requestHeaders: authorizedApiRequestHeaders(
          details.url,
          details.requestHeaders,
          apiBaseUrl,
          authorization,
        ),
      });
    },
  );
}

function createLocalAgent(authorization: string | undefined): LocalAgent {
  return new LocalAgent({
    executablePath: app.isPackaged
      ? process.execPath
      : (process.env.EVIDENCE_NODE_EXECUTABLE ?? 'node'),
    runtimeEntry: app.isPackaged
      ? join(
          process.resourcesPath,
          'app.asar.unpacked',
          'dist',
          'agent-runtime.mjs',
        )
      : join(__dirname, 'agent-runtime.mjs'),
    packaged: app.isPackaged,
    environment: {
      ...piRuntimeEnvironment(),
      ...(authorization ? { EVIDENCE_API_AUTHORIZATION: authorization } : {}),
    },
  });
}

function createIntakeAgent<
  TRequest extends
    | InboxAnalystRuntimeRequest
    | KickoffAnalystRuntimeRequest
    | UnderstandingAnalystRuntimeRequest
    | TaskingAnalystRuntimeRequest,
>(
  entryName:
    | 'inbox-analyst-runtime.mjs'
    | 'kickoff-analyst-runtime.mjs'
    | 'understanding-analyst-runtime.mjs'
    | 'tasking-analyst-runtime.mjs',
  authorization: string | undefined,
): LocalAgent<TRequest, IntakeAgentEvent> {
  return new LocalAgent({
    executablePath: app.isPackaged
      ? process.execPath
      : (process.env.EVIDENCE_NODE_EXECUTABLE ?? 'node'),
    runtimeEntry: app.isPackaged
      ? join(process.resourcesPath, 'app.asar.unpacked', 'dist', entryName)
      : join(__dirname, entryName),
    packaged: app.isPackaged,
    environment: {
      ...piRuntimeEnvironment(),
      ...(authorization ? { EVIDENCE_API_AUTHORIZATION: authorization } : {}),
    },
    parseEvent: parseIntakeAgentEvent,
  });
}

function createPairAgent<
  TRequest extends PairDriverRuntimeRequest | PairRedReviewerRuntimeRequest,
  TEvent extends PairDriverEvent | PairRedReviewerEvent,
>(
  entryName: 'pair-driver-runtime.mjs' | 'pair-red-reviewer-runtime.mjs',
  parseEvent: (value: unknown) => TEvent | null,
): LocalAgent<TRequest, TEvent> {
  return new LocalAgent({
    executablePath: app.isPackaged
      ? process.execPath
      : (process.env.EVIDENCE_NODE_EXECUTABLE ?? 'node'),
    runtimeEntry: app.isPackaged
      ? join(process.resourcesPath, 'app.asar.unpacked', 'dist', entryName)
      : join(__dirname, entryName),
    packaged: app.isPackaged,
    environment: piRuntimeEnvironment(),
    parseEvent,
  });
}

function createShowcaseReviewerAgent(): LocalAgent<
  ShowcaseReviewerRuntimeRequest,
  ShowcaseReviewerEvent
> {
  return new LocalAgent({
    executablePath: app.isPackaged
      ? process.execPath
      : (process.env.EVIDENCE_NODE_EXECUTABLE ?? 'node'),
    runtimeEntry: app.isPackaged
      ? join(
          process.resourcesPath,
          'app.asar.unpacked',
          'dist',
          'showcase-reviewer-runtime.mjs',
        )
      : join(__dirname, 'showcase-reviewer-runtime.mjs'),
    packaged: app.isPackaged,
    environment: piRuntimeEnvironment(),
    parseEvent: parseShowcaseReviewerEvent,
  });
}

function createRespondLearnerAgent(): LocalAgent<
  RespondLearnerRuntimeRequest,
  RespondLearnerEvent
> {
  return new LocalAgent({
    executablePath: app.isPackaged
      ? process.execPath
      : (process.env.EVIDENCE_NODE_EXECUTABLE ?? 'node'),
    runtimeEntry: app.isPackaged
      ? join(
          process.resourcesPath,
          'app.asar.unpacked',
          'dist',
          'respond-learner-runtime.mjs',
        )
      : join(__dirname, 'respond-learner-runtime.mjs'),
    packaged: app.isPackaged,
    environment: piRuntimeEnvironment(),
    parseEvent: parseRespondLearnerEvent,
  });
}

function pairExecutorId(): string {
  return `desktop-${createHash('sha256')
    .update(app.getPath('userData'))
    .digest('hex')
    .slice(0, 24)}`;
}

async function connectRemoteApi(): Promise<string> {
  const apiBaseUrl = resolveApiBaseUrl();
  const healthUrl = new URL('/health', apiBaseUrl).toString();
  const response = await fetch(healthUrl, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(
      `Remote Evidence API health check returned ${response.status}.`,
    );
  }
  return apiBaseUrl;
}

function canOpenExternally(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

async function verifyPackagedRuntime(
  window: BrowserWindow,
  apiBaseUrl: string,
  authorization: string | undefined,
): Promise<void> {
  if (!SMOKE_TEST) {
    return;
  }

  const response = await fetch(`${apiBaseUrl}/users/desktop-user`, {
    headers: authorization ? { Authorization: authorization } : {},
  });
  if (!response.ok) {
    throw new Error(`Packaged API smoke check returned ${response.status}.`);
  }
  if (!window.webContents.getURL().startsWith(APP_URL)) {
    throw new Error('Packaged renderer did not load from evidence://app/.');
  }

  process.stdout.write('EVIDENCE_DESKTOP_SMOKE_READY\n');
}

async function createWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    title: 'Evidence',
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (canOpenExternally(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    const destination = new URL(url);
    const allowed = app.isPackaged
      ? destination.protocol === `${APP_SCHEME}:` && destination.host === 'app'
      : destination.origin === new URL(resolveWebUrl()).origin;
    if (!allowed) {
      event.preventDefault();
      if (canOpenExternally(url)) {
        void shell.openExternal(url);
      }
    }
  });

  await window.loadURL(app.isPackaged ? APP_URL : resolveWebUrl());
  return window;
}

void app.whenReady().then(async () => {
  try {
    registerWebProtocol();
    const apiBaseUrl = await connectRemoteApi();
    const authorization = resolveApiAuthorization();
    registerRendererApiAuthorization(apiBaseUrl, authorization);
    localAgent = createLocalAgent(authorization);
    inboxAnalyst = createIntakeAgent<InboxAnalystRuntimeRequest>(
      'inbox-analyst-runtime.mjs',
      authorization,
    );
    kickoffAnalyst = createIntakeAgent<KickoffAnalystRuntimeRequest>(
      'kickoff-analyst-runtime.mjs',
      authorization,
    );
    understandingAnalyst =
      createIntakeAgent<UnderstandingAnalystRuntimeRequest>(
        'understanding-analyst-runtime.mjs',
        authorization,
      );
    taskingAnalyst = createIntakeAgent<TaskingAnalystRuntimeRequest>(
      'tasking-analyst-runtime.mjs',
      authorization,
    );
    const bindings = new WorkspaceBindingStore(
      join(app.getPath('userData'), 'workspace-bindings.json'),
    );
    const iterationWorktrees = new IterationWorktreeManager(
      join(app.getPath('userData'), 'iteration-worktrees'),
    );
    iterationController = new IterationController(
      apiBaseUrl,
      bindings,
      iterationWorktrees,
      new IntakeApiClient({ apiBaseUrl, authorization }),
    );
    const pairDriver = createPairAgent<
      PairDriverRuntimeRequest,
      PairDriverEvent
    >('pair-driver-runtime.mjs', parsePairDriverEvent);
    const pairRedReviewer = createPairAgent<
      PairRedReviewerRuntimeRequest,
      PairRedReviewerEvent
    >('pair-red-reviewer-runtime.mjs', parsePairRedReviewerEvent);
    pairController = new PairController({
      apiBaseUrl,
      executorId: pairExecutorId(),
      bindings,
      worktrees: iterationWorktrees,
      checkpoints: new PairCheckpointStore(
        join(app.getPath('userData'), 'pair-checkpoints'),
      ),
      client: new PairApiClient({ apiBaseUrl, authorization }),
      driver: pairDriver,
      redReviewer: pairRedReviewer,
      commands: new PairCommandRunner(),
    });
    const showcaseClient = new ShowcaseApiClient({ apiBaseUrl, authorization });
    showcaseController = new ShowcaseController({
      apiBaseUrl,
      bindings,
      worktrees: iterationWorktrees,
      client: showcaseClient,
      commands: new PairCommandRunner(),
      reviewer: createShowcaseReviewerAgent(),
    });
    respondController = new RespondController({
      apiBaseUrl,
      bindings,
      worktrees: iterationWorktrees,
      respond: new RespondApiClient({ apiBaseUrl, authorization }),
      showcase: showcaseClient,
      learner: createRespondLearnerAgent(),
    });
    registerDesktopBridge(
      apiBaseUrl,
      localAgent,
      bindings,
      inboxAnalyst,
      kickoffAnalyst,
      understandingAnalyst,
      taskingAnalyst,
      iterationController,
      pairController,
      showcaseController,
      respondController,
    );
    const window = await createWindow();
    await verifyPackagedRuntime(window, apiBaseUrl, authorization);

    if (SMOKE_TEST) {
      app.quit();
      return;
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow();
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (SMOKE_TEST) {
      process.stderr.write(`EVIDENCE_DESKTOP_SMOKE_FAILED: ${message}\n`);
    } else {
      dialog.showErrorBox('Evidence could not start', message);
    }
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (
    !allowQuit &&
    (localAgent ||
      inboxAnalyst ||
      kickoffAnalyst ||
      understandingAnalyst ||
      taskingAnalyst ||
      iterationController ||
      pairController ||
      showcaseController ||
      respondController)
  ) {
    event.preventDefault();
    allowQuit = true;
    iterationController?.stop();
    void Promise.all([
      pairController?.stop() ?? Promise.resolve(),
      Promise.resolve(showcaseController?.stop()),
      Promise.resolve(respondController?.stop()),
      localAgent?.stop() ?? Promise.resolve(),
      inboxAnalyst?.stop() ?? Promise.resolve(),
      kickoffAnalyst?.stop() ?? Promise.resolve(),
      understandingAnalyst?.stop() ?? Promise.resolve(),
      taskingAnalyst?.stop() ?? Promise.resolve(),
    ]).finally(() => app.quit());
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
