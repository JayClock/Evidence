import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  CdpClient,
  closeServer,
  delay,
  errorMessage,
  git,
  gitHead,
  listen,
  operatingSystemEnvironment,
  packageManager,
  packagedRuntime,
  readRequestBody,
  requiredString,
  reservePort,
  runChecked,
  runProcess,
  stopProcess,
  waitForHttp,
} from './package-e2e-support.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const desktopRoot = join(repositoryRoot, 'apps', 'desktop');
const packagesRoot = join(desktopRoot, 'dist', 'packages');
const packaged = packagedRuntime(packagesRoot);
const implementation = 'implemented by packaged fake provider\n';
let testRoot;

async function main() {
  testRoot = await mkdtemp(join(tmpdir(), 'evidence-package-e2e-'));
  const authorization = `Bearer package-e2e-${randomUUID()}`;
  let database;
  let server;
  let provider;
  let workspaceId;
  let intakeWorkspaceId;

  try {
    await access(packaged.executable);
    database = await provisionDatabase();
    await runChecked(
      packageManager(),
      ['prisma:migrate:deploy'],
      repositoryRoot,
      {
        ...process.env,
        DATABASE_URL: database.url,
        EVIDENCE_MIGRATION_DATABASE_URL: database.url,
      },
      120_000,
    );

    provider = await startFakeProvider();
    const piAgentDir = join(testRoot, 'pi-agent');
    await writeFakePiConfig(piAgentDir, provider.baseUrl);
    const repository = await createFixtureRepository(
      join(testRoot, 'repository'),
    );
    const userDataPath = join(testRoot, 'user-data');
    server = await startEvidenceServer(database.url, authorization, testRoot);
    const api = createApi(server.origin, authorization);
    const intakeWorkspace = await api.post('/api/workspaces', {
      title: `Packaged Intake E2E ${randomUUID()}`,
      metadata: { source: 'packaged-desktop-intake-e2e' },
    });
    intakeWorkspaceId = requiredString(
      intakeWorkspace.id,
      'Intake Workspace id',
    );
    await writeWorkspaceBinding(
      userDataPath,
      server.apiBaseUrl,
      intakeWorkspaceId,
      repository.root,
    );

    const commonEnvironment = {
      ...operatingSystemEnvironment(),
      EVIDENCE_API_BASE_URL: server.apiBaseUrl,
      EVIDENCE_API_AUTHORIZATION: authorization,
      EVIDENCE_USER_DATA_PATH: userDataPath,
      PI_CODING_AGENT_DIR: piAgentDir,
      PI_OFFLINE: '1',
      PI_SKIP_VERSION_CHECK: '1',
      PI_TELEMETRY: '0',
      DATABASE_URL: 'postgresql://must-not-reach-agent',
      UNRELATED_SECRET: 'must-not-reach-agent',
    };

    const extractionId = await createIntakeExtraction(
      api,
      intakeWorkspaceId,
      'lifecycle',
    );
    provider.setMode('normal');
    const intakeLifecycle = await runPackagedFlow(packaged.executable, {
      environment: commonEnvironment,
      input: {
        action: 'intake-lifecycle',
        requestId: `package-e2e-intake-${randomUUID()}`,
        workspaceId: intakeWorkspaceId,
        extractionId,
      },
    });
    if (
      intakeLifecycle.kind !== 'intake' ||
      intakeLifecycle.status !== 'understand' ||
      intakeLifecycle.storyReference !== 'US-001'
    ) {
      throw new Error(
        `Packaged Inbox -> Kickoff lifecycle was incomplete: ${JSON.stringify(intakeLifecycle)}.`,
      );
    }

    await api.delete(
      `/api/workspaces/${encodeURIComponent(intakeWorkspaceId)}`,
    );
    intakeWorkspaceId = undefined;

    const workspace = await api.post('/api/workspaces', {
      title: `Packaged Coding E2E ${randomUUID()}`,
      metadata: { source: 'packaged-desktop-coding-e2e' },
    });
    workspaceId = requiredString(workspace.id, 'Workspace id');
    await writeWorkspaceBinding(
      userDataPath,
      server.apiBaseUrl,
      workspaceId,
      repository.root,
    );
    const story = await createStory(
      api,
      workspaceId,
      'coding',
      repository.baseCommitSha,
    );
    const stories = Array.from({ length: 5 }, () => story);

    provider.setMode('normal');
    const accepted = await runPackagedFlow(packaged.executable, {
      environment: commonEnvironment,
      input: startInput(workspaceId, stories[0], 'accept'),
    });
    assertStatus(accepted, 'accepted');
    await verifyAcceptedGit(repository, accepted);
    await verifyBoundedRun(api, workspaceId, accepted, repository.root);

    provider.setMode('normal');
    const review = await runPackagedFlow(packaged.executable, {
      environment: commonEnvironment,
      input: startInput(workspaceId, stories[1], 'review'),
    });
    assertStatus(review, 'review_required');
    const recovered = await runPackagedFlow(packaged.executable, {
      environment: commonEnvironment,
      input: {
        action: 'accept-existing',
        workspaceId,
        runId: review.runId,
        diffSha256: review.diffSha256,
      },
    });
    assertStatus(recovered, 'accepted');
    if (recovered.runId !== review.runId) {
      throw new Error('Restart recovery accepted a different Coding Run.');
    }
    await verifyAcceptedGit(repository, recovered);

    provider.setMode('normal');
    const rejected = await runPackagedFlow(packaged.executable, {
      environment: commonEnvironment,
      input: startInput(workspaceId, stories[2], 'reject'),
    });
    assertStatus(rejected, 'rejected');
    await verifyRemovedBranch(repository.root, rejected.runId);

    provider.setMode('error');
    const providerFailure = await refreshRunResult(
      api,
      workspaceId,
      await runPackagedFlow(packaged.executable, {
        environment: commonEnvironment,
        input: startInput(workspaceId, stories[3], 'expect-failure'),
      }),
    );
    assertStatus(providerFailure, 'failed');
    await verifyRemovedBranch(repository.root, providerFailure.runId);

    provider.setMode('hang');
    const timedOut = await refreshRunResult(
      api,
      workspaceId,
      await runPackagedFlow(packaged.executable, {
        environment: {
          ...commonEnvironment,
          EVIDENCE_CODING_AGENT_TIMEOUT_MS: '300',
        },
        input: startInput(workspaceId, stories[4], 'expect-failure'),
      }),
    );
    assertStatus(timedOut, 'failed');
    await verifyRemovedBranch(repository.root, timedOut.runId);

    if (provider.requests.length < 12) {
      throw new Error(
        'Fake Pi Provider did not observe the expected SDK turns.',
      );
    }
    for (const request of provider.requests) {
      const serialized = JSON.stringify(request);
      if (
        serialized.includes(authorization) ||
        serialized.includes('must-not-reach-agent') ||
        serialized.includes(repository.root)
      ) {
        throw new Error(
          'A local secret or repository path reached the Pi Provider.',
        );
      }
    }

    process.stdout.write(
      `Packaged Desktop coding E2E passed: ${JSON.stringify({
        intakeIteration: intakeLifecycle.iterationReference,
        acceptedRunId: accepted.runId,
        recoveredRunId: recovered.runId,
        rejectedRunId: rejected.runId,
        providerFailureRunId: providerFailure.runId,
        timedOutRunId: timedOut.runId,
      })}\n`,
    );
  } catch (error) {
    if (server?.output) process.stderr.write(server.output());
    throw error;
  } finally {
    if (server) {
      const api = createApi(server.origin, authorization);
      for (const id of [workspaceId, intakeWorkspaceId]) {
        if (id) {
          await api
            .delete(`/api/workspaces/${encodeURIComponent(id)}`)
            .catch(() => undefined);
        }
      }
    }
    await server?.close().catch(() => undefined);
    await provider?.close().catch(() => undefined);
    await database?.close().catch(() => undefined);
    await rm(testRoot, { recursive: true, force: true });
  }
}

function startInput(targetWorkspaceId, story, action) {
  return {
    action,
    requestId: `package-e2e-${randomUUID()}`,
    workspaceId: targetWorkspaceId,
    storyId: story.storyId,
    storyRevisionId: story.storyRevisionId,
  };
}

async function createIntakeExtraction(api, targetWorkspaceId, name) {
  const workspacePath = `/api/workspaces/${encodeURIComponent(targetWorkspaceId)}`;
  const source = await api.post(`${workspacePath}/inbox-items`, {
    sourceKind: 'manual_text',
    externalKey: `package-e2e-intake-${name}-${randomUUID()}`,
    title: 'Packaged Inbox Kickoff lifecycle',
    body: 'A Workspace maintainer needs one frozen delivery Story so the packaged authority boundary is auditable.',
    contentType: 'text/plain',
  });
  const extraction = await api.post(`${workspacePath}/inbox-extractions`, {
    inboxItemIds: [requiredString(source.id, 'Inbox Item id')],
  });
  return requiredString(extraction.id, 'Inbox Extraction id');
}

async function createStory(api, targetWorkspaceId, name, baseCommitSha) {
  const workspacePath = `/api/workspaces/${encodeURIComponent(targetWorkspaceId)}`;
  const source = await api.post(`${workspacePath}/inbox-items`, {
    sourceKind: 'manual_text',
    externalKey: `package-e2e-${name}-${randomUUID()}`,
    title: `Packaged coding ${name}`,
    body: 'Use the local coding agent to update tracked.txt and run repository quality gates.',
    contentType: 'text/plain',
  });
  const content = {
    title: `Packaged coding ${name}`,
    problem: 'The fixture still contains its original value.',
    role: 'Workspace maintainer',
    goal: 'Replace the fixture value through the isolated local Coding Run.',
    value: 'The packaged Desktop delivery boundary is verified end to end.',
    cognitiveMode: 'clear',
  };
  const extraction = await api.post(`${workspacePath}/inbox-extractions`, {
    inboxItemIds: [requiredString(source.id, 'Inbox Item id')],
  });
  const candidateSet = await api.post(
    `${workspacePath}/inbox-extractions/${encodeURIComponent(requiredString(extraction.id, 'Inbox Extraction id'))}/candidates`,
    {
      expectedVersion: 1,
      candidates: [
        {
          ...content,
          citations: [
            {
              inboxItemId: requiredString(source.id, 'Inbox Item id'),
              revisionSha256: requiredString(
                source.latestRevisionSha256,
                'Inbox Revision SHA-256',
              ),
              locator: 'whole-source',
            },
          ],
        },
      ],
    },
  );
  const candidate = candidateSet._embedded?.storyCandidates?.[0];
  const candidateId = requiredString(candidate?.id, 'Inbox Candidate id');
  const iteration = await api.post(
    `${workspacePath}/story-candidates/${encodeURIComponent(candidateId)}/select`,
    {
      candidateSha256: requiredString(
        candidate?.contentSha256,
        'Inbox Candidate SHA-256',
      ),
      baseCommitSha,
    },
  );
  const iterationId = requiredString(iteration.id, 'Iteration id');
  await api.post(
    `${workspacePath}/iterations/${encodeURIComponent(iterationId)}/provisioning/complete`,
    {
      expectedVersion: 1,
      baseCommitSha,
      branchName: `evidence/iter-${iterationId}`,
    },
  );
  const kickoff = await api.get(
    `${workspacePath}/iterations/${encodeURIComponent(iterationId)}/kickoff`,
  );
  const confirmed = await api.post(
    `${workspacePath}/iterations/${encodeURIComponent(iterationId)}/kickoff/decisions`,
    {
      proposalId: requiredString(
        kickoff.currentProposal?.id,
        'Kickoff Proposal id',
      ),
      proposalSha256: requiredString(
        kickoff.currentProposal?.contentSha256,
        'Kickoff Proposal SHA-256',
      ),
      expectedIterationVersion: 2,
      action: 'confirm',
    },
  );
  const storyId = requiredString(confirmed.storyCard?.storyId, 'Story id');
  const story = await api.get(
    `${workspacePath}/stories/${encodeURIComponent(storyId)}`,
  );
  const revision = await api.post(
    `${workspacePath}/stories/${encodeURIComponent(storyId)}/revisions`,
    {
      expectedVersion: 1,
      expectedLatestRevisionId: requiredString(
        story.latestRevisionId,
        'baseline Story Revision id',
      ),
      ...content,
      citations: [
        {
          inboxItemId: requiredString(source.id, 'Inbox Item id'),
          inboxRevisionId: requiredString(
            source.latestRevisionId,
            'Inbox Revision id',
          ),
          contentSha256: requiredString(
            source.latestRevisionSha256,
            'Inbox Revision SHA-256',
          ),
          locator: 'whole-source',
        },
      ],
      scenarios: [
        {
          title: `Implement the ${name} fixture`,
          given: ['tracked.txt contains the original fixture value.'],
          when: 'The packaged Desktop runs the confirmed Story Revision.',
          then: [
            'tracked.txt contains the implementation produced by the fake Pi Provider.',
            'Every declared repository quality gate passes.',
          ],
        },
      ],
    },
  );
  return {
    storyId,
    storyRevisionId: requiredString(revision.id, 'Story Revision id'),
  };
}

async function createFixtureRepository(path) {
  await mkdir(path, { recursive: true });
  await writeFile(
    join(path, 'package.json'),
    `${JSON.stringify(
      {
        name: 'evidence-packaged-e2e-fixture',
        version: '1.0.0',
        private: true,
        scripts: {
          test: 'node quality-gate.mjs',
          lint: 'node quality-gate.mjs',
          typecheck: 'node quality-gate.mjs',
          build: 'node quality-gate.mjs',
          'api:check': 'node quality-gate.mjs',
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(join(path, 'tracked.txt'), 'original\n');
  await writeFile(join(path, '.gitignore'), 'node_modules/\n');
  await writeFile(
    join(path, 'quality-gate.mjs'),
    `import { readFile } from 'node:fs/promises';
const content = await readFile(new URL('./tracked.txt', import.meta.url), 'utf8');
if (content !== ${JSON.stringify(implementation)}) throw new Error('Implementation is incomplete.');
for (const key of ['DATABASE_URL', 'EVIDENCE_API_AUTHORIZATION', 'UNRELATED_SECRET', 'OPENAI_API_KEY']) {
  if (process.env[key]) throw new Error(key + ' reached a quality gate.');
}
process.stdout.write('fixture quality gate passed\\n');
`,
  );
  await runChecked(
    packageManager(),
    ['install', '--lockfile-only', '--ignore-scripts'],
    path,
    operatingSystemEnvironment(),
    60_000,
  );
  await git(path, ['init', '--initial-branch=main']);
  await git(path, ['config', 'user.name', 'Evidence Package E2E']);
  await git(path, ['config', 'user.email', 'package-e2e@evidence.local']);
  await git(path, ['add', '--all']);
  await git(path, ['commit', '-m', 'test: initialize packaged e2e fixture']);
  return { root: await realpath(path), baseCommitSha: await gitHead(path) };
}

async function writeFakePiConfig(agentDir, providerBaseUrl) {
  await mkdir(agentDir, { recursive: true });
  await writeFile(
    join(agentDir, 'models.json'),
    `${JSON.stringify(
      {
        providers: {
          'evidence-e2e': {
            baseUrl: `${providerBaseUrl}/v1`,
            api: 'openai-completions',
            apiKey: 'packaged-e2e-provider-key',
            compat: {
              supportsDeveloperRole: false,
              supportsReasoningEffort: false,
              supportsUsageInStreaming: false,
              maxTokensField: 'max_tokens',
            },
            models: [
              {
                id: 'deterministic-coder',
                name: 'Deterministic Packaged E2E Coder',
                reasoning: false,
                input: ['text'],
                contextWindow: 32_000,
                maxTokens: 2_000,
                cost: {
                  input: 0,
                  output: 0,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
              },
            ],
          },
        },
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
}

async function writeWorkspaceBinding(
  userDataPath,
  apiBaseUrl,
  targetWorkspaceId,
  repositoryPath,
) {
  await mkdir(userDataPath, { recursive: true });
  const normalizedApiBaseUrl = new URL(apiBaseUrl)
    .toString()
    .replace(/\/$/, '');
  const binding = {
    apiBaseUrl: normalizedApiBaseUrl,
    workspaceId: targetWorkspaceId,
    repositoryRoot: repositoryPath,
    boundAt: new Date().toISOString(),
  };
  await writeFile(
    join(userDataPath, 'workspace-bindings.json'),
    `${JSON.stringify(
      {
        version: 1,
        bindings: {
          [`${normalizedApiBaseUrl}\u0000${targetWorkspaceId}`]: binding,
        },
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
}

async function verifyAcceptedGit(repository, result) {
  const mainHead = await gitHead(repository.root);
  if (mainHead !== repository.baseCommitSha) {
    throw new Error('Packaged Coding Run changed the primary working tree.');
  }
  if (
    (await readFile(join(repository.root, 'tracked.txt'), 'utf8')) !==
    'original\n'
  ) {
    throw new Error('Packaged Coding Run changed the primary checkout.');
  }
  const branch = `evidence/run-${result.runId}`;
  const branchHead = (await git(repository.root, ['rev-parse', branch])).trim();
  if (branchHead !== result.commitSha) {
    throw new Error('Accepted Coding Run branch does not identify its commit.');
  }
  const content = await git(repository.root, [
    'show',
    `${result.commitSha}:tracked.txt`,
  ]);
  if (content !== implementation) {
    throw new Error(
      'Accepted Coding Run commit does not contain the implementation.',
    );
  }
  if ((await git(repository.root, ['remote'])).trim()) {
    throw new Error('Packaged E2E fixture unexpectedly has a Git remote.');
  }
}

async function verifyRemovedBranch(repositoryPath, runId) {
  const exists = await git(repositoryPath, [
    'show-ref',
    '--verify',
    `refs/heads/evidence/run-${runId}`,
  ])
    .then(() => true)
    .catch(() => false);
  if (exists)
    throw new Error(`Coding Run ${runId} retained a rejected branch.`);
}

async function refreshRunResult(api, targetWorkspaceId, result) {
  const run = await api.get(
    `/api/workspaces/${encodeURIComponent(targetWorkspaceId)}/coding-runs/${encodeURIComponent(result.runId)}`,
  );
  return {
    ...result,
    status: requiredString(run.status, 'Coding Run status'),
    diffSha256:
      typeof run.diffSha256 === 'string' ? run.diffSha256 : result.diffSha256,
    commitSha:
      typeof run.commitSha === 'string' ? run.commitSha : result.commitSha,
  };
}

async function verifyBoundedRun(
  api,
  targetWorkspaceId,
  result,
  repositoryPath,
) {
  const run = await api.get(
    `/api/workspaces/${encodeURIComponent(targetWorkspaceId)}/coding-runs/${encodeURIComponent(result.runId)}`,
  );
  const serialized = JSON.stringify(run);
  for (const forbidden of [
    repositoryPath,
    implementation.trim(),
    'diff --git',
  ]) {
    if (serialized.includes(forbidden)) {
      throw new Error('Server Coding Run resource contains local-only data.');
    }
  }
  if (run.status !== 'accepted' || run.diffSha256 !== result.diffSha256) {
    throw new Error(
      'Server Coding Run facts do not match the Desktop decision.',
    );
  }
}

function assertStatus(result, expected) {
  if (!result || result.status !== expected) {
    throw new Error(
      `Packaged Coding Run expected ${expected}, received ${JSON.stringify(result)}.`,
    );
  }
  requiredString(result.runId, 'Coding Run id');
  if (expected === 'accepted') requiredString(result.commitSha, 'commit SHA');
}

async function runPackagedFlow(executable, options) {
  const debuggingPort = await reservePort();
  const launch = electronLaunch(executable, debuggingPort);
  const child = spawn(launch.command, launch.args, {
    cwd: testRoot,
    env: options.environment,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const append = (chunk) => {
    output = `${output}${chunk.toString()}`.slice(-100_000);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);

  let cdp;
  try {
    const endpoint = await waitForDevTools(debuggingPort, child, () => output);
    cdp = await CdpClient.connect(endpoint.webSocketDebuggerUrl);
    await waitForRendererBridge(cdp);
    const result = validateFlowResult(
      await cdp.evaluate(rendererExpression(options.input)),
    );
    await cdp.closeBrowser().catch(() => undefined);
    await stopProcess(child);
    return result;
  } catch (error) {
    await stopProcess(child);
    throw new Error(
      `Packaged Desktop flow failed: ${errorMessage(error)}${output.trim() ? `\n${output}` : ''}`,
    );
  } finally {
    cdp?.close();
    if (child.exitCode === null && child.signalCode === null) {
      await stopProcess(child);
    }
  }
}

async function waitForRendererBridge(cdp) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (
      await cdp
        .evaluate(
          `Boolean(
          window.evidenceDesktop?.runCodingAgent &&
          window.evidenceDesktop?.runInboxAnalyst &&
          window.evidenceDesktop?.startIteration &&
          window.evidenceDesktop?.runKickoffAnalyst
        )`,
        )
        .catch(() => false)
    ) {
      return;
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for the Desktop preload bridge.');
}

function rendererExpression(input) {
  return `(async () => {
    const input = ${JSON.stringify(input)};
    const bridge = window.evidenceDesktop;
    if (!bridge) throw new Error('Desktop preload bridge is unavailable.');
    const summarize = (run, extra = {}) => ({
      runId: String(run.id ?? ''),
      status: String(run.status ?? ''),
      diffSha256: typeof run.diffSha256 === 'string' ? run.diffSha256 : null,
      changedFileCount: typeof run.changedFileCount === 'number' ? run.changedFileCount : null,
      commitSha: typeof run.commitSha === 'string' ? run.commitSha : null,
      ...extra,
    });
    if (input.action === 'intake-lifecycle') {
      const apiBaseUrl = await bridge.getApiBaseUrl();
      const request = async (path, options = {}) => {
        const response = await fetch(apiBaseUrl + path, {
          ...options,
          headers: {
            Accept: 'application/json',
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          },
        });
        const body = await response.json();
        if (!response.ok) {
          throw new Error('Intake API ' + path + ' returned ' + response.status + ': ' + JSON.stringify(body));
        }
        return body;
      };
      const inboxEvents = [];
      await bridge.runInboxAnalyst({
        id: input.requestId,
        workspaceId: input.workspaceId,
        extractionId: input.extractionId,
      }, (event) => inboxEvents.push(event));
      const workspacePath = '/workspaces/' + encodeURIComponent(input.workspaceId);
      const candidates = await request(workspacePath + '/story-candidates?status=ready&page=1&pageSize=20');
      const candidate = candidates._embedded?.storyCandidates?.find(
        (entry) => entry.extractionId === input.extractionId,
      );
      if (!candidate) throw new Error('Inbox Analyst did not create a ready Candidate.');
      const iteration = await bridge.startIteration({
        id: input.requestId + ':iteration',
        workspaceId: input.workspaceId,
        candidateId: candidate.id,
      });
      const kickoffPath = workspacePath + '/iterations/' + encodeURIComponent(iteration.iterationId) + '/kickoff';
      const kickoff = await request(kickoffPath);
      await request(kickoffPath + '/decisions', {
        method: 'POST',
        body: JSON.stringify({
          proposalId: kickoff.currentProposal.id,
          proposalSha256: kickoff.currentProposal.contentSha256,
          expectedIterationVersion: kickoff.iteration.version,
          action: 'revise',
          reason: 'Exercise the packaged Frozen Intake revision boundary.',
        }),
      });
      const kickoffEvents = [];
      await bridge.runKickoffAnalyst({
        id: input.requestId + ':kickoff',
        workspaceId: input.workspaceId,
        iterationId: iteration.iterationId,
      }, (event) => kickoffEvents.push(event));
      const revised = await request(kickoffPath);
      const confirmed = await request(kickoffPath + '/decisions', {
        method: 'POST',
        body: JSON.stringify({
          proposalId: revised.currentProposal.id,
          proposalSha256: revised.currentProposal.contentSha256,
          expectedIterationVersion: revised.iteration.version,
          action: 'confirm',
        }),
      });
      return {
        kind: 'intake',
        status: String(confirmed.iteration.loop ?? ''),
        iterationReference: String(confirmed.iteration.reference ?? ''),
        storyReference: String(confirmed.storyCard?.reference ?? ''),
        branchName: iteration.branchName,
        inboxEventNames: inboxEvents.map((event) => event.event),
        kickoffEventNames: kickoffEvents.map((event) => event.event),
      };
    }
    if (input.action === 'accept-existing') {
      const review = await bridge.getCodingReview(input.runId);
      if (!review || review.diffSha256 !== input.diffSha256) {
        throw new Error('Persisted local review could not be recovered.');
      }
      const accepted = await bridge.acceptCodingRun({
        workspaceId: input.workspaceId,
        runId: input.runId,
        diffSha256: input.diffSha256,
      });
      return summarize(accepted, { recovered: true, eventNames: [] });
    }

    const events = [];
    let executionFailed = false;
    try {
      await bridge.runCodingAgent({
        id: input.requestId,
        workspaceId: input.workspaceId,
        storyId: input.storyId,
        storyRevisionId: input.storyRevisionId,
      }, (event) => events.push(event));
    } catch {
      executionFailed = true;
    }
    const payload = (name) => {
      const event = [...events].reverse().find((candidate) => candidate.event === name);
      if (!event) return null;
      try { return JSON.parse(event.data); } catch { return null; }
    };
    if (input.action === 'expect-failure') {
      const failed = payload('run-failed')?.run ?? payload('run-started')?.run;
      if (!executionFailed || !failed) throw new Error('Coding Run did not fail deterministically.');
      return summarize(failed, { executionFailed, eventNames: events.map((event) => event.event) });
    }
    if (executionFailed) throw new Error('Coding Run failed before review.');
    const ready = payload('review-ready');
    const runId = String(ready?.run?.id ?? '');
    const review = await bridge.getCodingReview(runId);
    if (!review || review.diffSha256 !== ready?.diffSha256) {
      throw new Error('Local diff review is unavailable or changed.');
    }
    if (input.action === 'review') {
      return summarize(review.run, { eventNames: events.map((event) => event.event) });
    }
    if (input.action === 'reject') {
      const rejected = await bridge.rejectCodingRun({
        workspaceId: input.workspaceId,
        runId,
        diffSha256: review.diffSha256,
        reason: 'Deterministic packaged E2E rejection.',
      });
      return summarize(rejected, { eventNames: events.map((event) => event.event) });
    }
    const accepted = await bridge.acceptCodingRun({
      workspaceId: input.workspaceId,
      runId,
      diffSha256: review.diffSha256,
    });
    return summarize(accepted, { eventNames: events.map((event) => event.event) });
  })()`;
}

function validateFlowResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Packaged renderer returned an invalid Coding Run result.');
  }
  const result = value;
  if (result.kind === 'intake') {
    requiredString(result.iterationReference, 'Iteration reference');
    requiredString(result.storyReference, 'Story reference');
    if (!/^evidence\/iter-[a-zA-Z0-9._-]+$/.test(String(result.branchName))) {
      throw new Error(
        'Packaged renderer returned an invalid Iteration branch.',
      );
    }
    if (
      !Array.isArray(result.inboxEventNames) ||
      !result.inboxEventNames.includes('complete') ||
      !Array.isArray(result.kickoffEventNames) ||
      !result.kickoffEventNames.includes('complete')
    ) {
      throw new Error('Packaged intake Agents did not complete.');
    }
    return result;
  }
  requiredString(result.runId, 'Coding Run id');
  requiredString(result.status, 'Coding Run status');
  if (
    result.diffSha256 !== null &&
    !/^sha256:[a-f0-9]{64}$/.test(String(result.diffSha256))
  ) {
    throw new Error('Packaged renderer returned an invalid diff SHA-256.');
  }
  if (
    result.commitSha !== null &&
    !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(String(result.commitSha))
  ) {
    throw new Error('Packaged renderer returned an invalid commit SHA.');
  }
  return result;
}

async function startFakeProvider() {
  let mode = 'normal';
  const requests = [];
  const sockets = new Set();
  const serverInstance = createHttpServer(async (request, response) => {
    if (
      request.method !== 'POST' ||
      !request.url?.endsWith('/chat/completions')
    ) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'Not found' } }));
      return;
    }
    const body = JSON.parse(await readRequestBody(request));
    requests.push({
      path: request.url,
      authorization: request.headers.authorization ?? null,
      body,
    });
    if (mode === 'error') {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          error: {
            message: 'Deterministic packaged E2E provider failure.',
            type: 'invalid_request_error',
          },
        }),
      );
      return;
    }
    if (mode === 'hang') {
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      });
      response.write(': waiting\n\n');
      return;
    }

    const hasToolResult = Array.isArray(body.messages)
      ? body.messages.some((message) => message?.role === 'tool')
      : false;
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    if (hasToolResult) {
      sendSse(
        response,
        completionChunk(body.model, {
          role: 'assistant',
          content:
            'Implemented the confirmed fixture and inspected the tool result.',
        }),
      );
      sendSse(response, completionChunk(body.model, {}, 'stop'));
    } else {
      const toolCall = providerToolCall(body);
      sendSse(
        response,
        completionChunk(body.model, {
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: `call_${randomUUID().replaceAll('-', '')}`,
              type: 'function',
              function: {
                name: toolCall.name,
                arguments: JSON.stringify(toolCall.arguments),
              },
            },
          ],
        }),
      );
      sendSse(response, completionChunk(body.model, {}, 'tool_calls'));
    }
    response.end('data: [DONE]\n\n');
  });
  serverInstance.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  await listen(serverInstance);
  const address = serverInstance.address();
  if (!address || typeof address === 'string') {
    throw new Error('Fake Provider did not expose a TCP address.');
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    setMode(value) {
      mode = value;
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await closeServer(serverInstance);
    },
  };
}

function providerToolCall(body) {
  const toolNames = Array.isArray(body.tools)
    ? body.tools
        .map((tool) => tool?.function?.name)
        .filter((name) => typeof name === 'string')
    : [];
  if (toolNames.includes('evidence_propose_inbox_stories')) {
    const extraction = providerPromptJson(body);
    const source = extraction.sources?.[0];
    return {
      name: 'evidence_propose_inbox_stories',
      arguments: {
        candidates: [
          {
            title: 'Packaged Inbox Kickoff lifecycle',
            problem: 'The packaged authority boundary is not yet demonstrated.',
            role: 'Workspace maintainer',
            goal: 'Confirm one frozen delivery Story.',
            value: 'The packaged lifecycle remains auditable.',
            cognitiveMode: 'clear',
            citations: [
              {
                inboxItemId: requiredString(
                  source?.inboxItemId,
                  'provider Inbox Item id',
                ),
                revisionSha256: requiredString(
                  source?.contentSha256,
                  'provider Inbox Revision SHA-256',
                ),
                locator: 'whole-source',
              },
            ],
          },
        ],
      },
    };
  }
  if (toolNames.includes('evidence_propose_kickoff_candidate')) {
    const context = providerPromptJson(body);
    const candidate = context.intake?.candidate;
    return {
      name: 'evidence_propose_kickoff_candidate',
      arguments: {
        title: 'Revised packaged Inbox Kickoff lifecycle',
        problem:
          'The packaged Frozen Intake revision boundary needs explicit evidence.',
        role: requiredString(candidate?.role, 'provider Candidate role'),
        goal: 'Confirm one revised frozen delivery Story.',
        value: requiredString(candidate?.value, 'provider Candidate value'),
        cognitiveMode: 'clear',
        citations: Array.isArray(candidate?.citations)
          ? candidate.citations.map((citation) => ({
              inboxItemId: requiredString(
                citation?.inboxItemId,
                'provider citation Inbox Item id',
              ),
              revisionSha256: requiredString(
                citation?.revisionSha256,
                'provider citation Revision SHA-256',
              ),
              locator: 'whole-source',
            }))
          : [],
      },
    };
  }
  return {
    name: 'write',
    arguments: { path: 'tracked.txt', content: implementation },
  };
}

function providerPromptJson(body) {
  const messages = Array.isArray(body.messages) ? [...body.messages] : [];
  const message = messages.reverse().find((entry) => entry?.role === 'user');
  const content = message?.content;
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .map((part) => (typeof part?.text === 'string' ? part.text : ''))
            .join('')
        : '';
  const start = text.indexOf('{');
  if (start < 0) throw new Error('Fake Provider could not find prompt JSON.');
  return JSON.parse(text.slice(start));
}

function completionChunk(model, delta, finishReason = null) {
  return {
    id: `chatcmpl-${randomUUID()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1_000),
    model: typeof model === 'string' ? model : 'deterministic-coder',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

function sendSse(response, value) {
  response.write(`data: ${JSON.stringify(value)}\n\n`);
}

async function startEvidenceServer(databaseUrl, apiAuthorization, root) {
  const port = await reservePort();
  const child = spawn(
    process.execPath,
    [join(repositoryRoot, 'apps/server/dist/main.js')],
    {
      cwd: root,
      env: {
        ...operatingSystemEnvironment(),
        DATABASE_URL: databaseUrl,
        EVIDENCE_API_AUTHORIZATION: apiAuthorization,
        EVIDENCE_DEFAULT_WORKSPACE_PATH: join(root, 'default-workspace'),
        EVIDENCE_WORKSPACE_STORAGE_ROOT: join(root, 'workspace-models'),
        EVIDENCE_CORS_ORIGINS: 'evidence://app',
        EVIDENCE_HOST: '127.0.0.1',
        PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let combinedOutput = '';
  const append = (chunk) => {
    combinedOutput = `${combinedOutput}${chunk.toString()}`.slice(-100_000);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  const origin = `http://127.0.0.1:${port}`;
  await waitForHttp(`${origin}/health`, child, () => combinedOutput, 20_000);
  return {
    origin,
    apiBaseUrl: `${origin}/api`,
    output: () => combinedOutput,
    close: () => stopProcess(child),
  };
}

function createApi(origin, apiAuthorization) {
  const request = async (method, path, body) => {
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: {
        authorization: apiAuthorization,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(
        `${method} ${path} returned ${String(response.status)}: ${text.slice(0, 2_000)}`,
      );
    }
    return parsed;
  };
  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    delete: (path) => request('DELETE', path),
  };
}

async function provisionDatabase() {
  const configured = process.env.DATABASE_URL?.trim();
  if (configured) {
    assertDisposableDatabase(configured);
    return { url: configured, close: async () => undefined };
  }
  const name = `evidence-package-e2e-${randomUUID()}`;
  const port = await reservePort();
  await runChecked(
    'docker',
    [
      'run',
      '--detach',
      '--name',
      name,
      '--env',
      'POSTGRES_USER=postgres',
      '--env',
      'POSTGRES_PASSWORD=postgres',
      '--env',
      'POSTGRES_DB=evidence',
      '--publish',
      `127.0.0.1:${String(port)}:5432`,
      'postgres:17',
    ],
    repositoryRoot,
    operatingSystemEnvironment(),
    120_000,
  );
  try {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const ready = await runProcess(
        'docker',
        ['exec', name, 'pg_isready', '-U', 'postgres', '-d', 'evidence'],
        repositoryRoot,
        operatingSystemEnvironment(),
        5_000,
      );
      if (ready.exitCode === 0) {
        return {
          url: `postgresql://postgres:postgres@127.0.0.1:${String(port)}/evidence`,
          close: async () => {
            await runProcess(
              'docker',
              ['rm', '--force', name],
              repositoryRoot,
              operatingSystemEnvironment(),
              30_000,
            );
          },
        };
      }
      await delay(250);
    }
    throw new Error('Disposable PostgreSQL did not become ready.');
  } catch (error) {
    await runProcess(
      'docker',
      ['rm', '--force', name],
      repositoryRoot,
      operatingSystemEnvironment(),
      30_000,
    );
    throw error;
  }
}

function assertDisposableDatabase(value) {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Package E2E DATABASE_URL must use PostgreSQL.');
  }
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
    process.env.EVIDENCE_ALLOW_REMOTE_PACKAGE_E2E_DATABASE !== '1'
  ) {
    throw new Error('Package E2E refuses a non-loopback PostgreSQL database.');
  }
}

function electronLaunch(executable, debuggingPort) {
  const electronArgs = [`--remote-debugging-port=${String(debuggingPort)}`];
  if (process.platform === 'linux' && !process.env.DISPLAY) {
    return {
      command: 'xvfb-run',
      args: ['-a', executable, ...electronArgs],
    };
  }
  return { command: executable, args: electronArgs };
}

async function waitForDevTools(port, child, output) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Packaged Desktop exited before DevTools was ready (${String(child.exitCode)}).\n${output()}`,
      );
    }
    try {
      const response = await fetch(
        `http://127.0.0.1:${String(port)}/json/list`,
      );
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find(
          (target) =>
            target.type === 'page' &&
            typeof target.webSocketDebuggerUrl === 'string' &&
            String(target.url).startsWith('evidence://app/'),
        );
        if (page) return page;
      }
    } catch {
      // Electron has not opened the debugging endpoint yet.
    }
    await delay(100);
  }
  throw new Error(
    `Timed out waiting for packaged Desktop DevTools.\n${output()}`,
  );
}

await main();
