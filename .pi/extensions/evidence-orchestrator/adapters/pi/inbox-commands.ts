import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';
import {
  captureInboxSource,
  latestInboxRevision,
  readInboxState,
} from '../../capabilities/inbox/repository';
import {
  inboxCandidateStatus,
  listInboxStoryCandidates,
  recordInboxCandidateDecision,
} from '../../capabilities/inbox/story-candidate';
import { runActivityAgent } from '../node/activity-agent-process';
import { createGitHubIssueInboxSource } from '../github/inbox-source';
import {
  localMarkdownInboxSource,
  manualTextInboxSource,
} from '../local/inbox-sources';
import { createGitHubCliRunner } from '../github/pi-cli';
import { selectOrCreateGitHubIssue } from './issue-picker';
import { runWithLoader } from './loading';

const SOURCE_OPTIONS = ['GitHub Issue', '手工文本', '本地 Markdown'] as const;

type SourceKind = 'github' | 'text' | 'file';

interface ParsedInboxCommand {
  action: 'home' | 'list' | 'add' | 'sync' | 'extract' | 'defer' | 'reject';
  sourceKind?: SourceKind;
  rest: string;
}

export type InboxAgentRunner = typeof runActivityAgent;

function parseCommand(args: string): ParsedInboxCommand {
  const tokens = args.trim() ? args.trim().split(/\s+/) : [];
  if (tokens.length === 0) return { action: 'home', rest: '' };
  const [action, sourceKind, ...rest] = tokens;
  if (action === 'list' || action === 'status') {
    return { action: 'list', rest: '' };
  }
  if (['sync', 'extract', 'defer', 'reject'].includes(action)) {
    return {
      action: action as 'sync' | 'extract' | 'defer' | 'reject',
      rest: [sourceKind, ...rest].filter(Boolean).join(' '),
    };
  }
  if (action !== 'add') {
    throw new Error(
      'Usage: /evidence-inbox [list | add github|text|file | sync INBOX-xxxx | extract INBOX-xxxx,... | defer|reject CAND-xxxx <reason>].',
    );
  }
  if (sourceKind && !['github', 'text', 'file'].includes(sourceKind)) {
    throw new Error(`Unsupported Inbox source: ${sourceKind}.`);
  }
  return {
    action: 'add',
    ...(sourceKind ? { sourceKind: sourceKind as SourceKind } : {}),
    rest: rest.join(' '),
  };
}

function inboxStatus(cwd: string): string {
  const state = readInboxState(cwd);
  const candidates = listInboxStoryCandidates(cwd);
  const items = state.items.map(
    (item) =>
      `- ${item.inbox_id} · ${item.source_kind} · ${item.title} · ${item.revision_paths.length} revision(s) · ${item.status}`,
  );
  const stories = candidates.map(
    (candidate) =>
      `- ${candidate.candidate_id} · ${candidate.title} · ${inboxCandidateStatus(cwd, candidate)}`,
  );
  return [
    '# Evidence Inbox',
    '',
    `Items: ${state.items.length}`,
    '',
    items.length ? items.join('\n') : '- empty',
    '',
    `Story Candidates: ${candidates.length}`,
    '',
    stories.length ? stories.join('\n') : '- none',
  ].join('\n');
}

async function selectSourceKind(
  ctx: ExtensionCommandContext,
): Promise<SourceKind | undefined> {
  if (!ctx.hasUI) {
    throw new Error('Specify an Inbox source: github, text, or file.');
  }
  const selected = await ctx.ui.select('Add an Inbox source', [
    ...SOURCE_OPTIONS,
  ]);
  if (selected === 'GitHub Issue') return 'github';
  if (selected === '手工文本') return 'text';
  if (selected === '本地 Markdown') return 'file';
  return undefined;
}

function parseGitHubReference(value: string): {
  issueNumber: number;
  repository?: string;
} {
  const match = value.trim().match(/^(?:(.+?)#)?#?(\d+)$/);
  const issueNumber = Number(match?.[2]);
  if (!match || !Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('GitHub source must be #123 or owner/repository#123.');
  }
  return {
    issueNumber,
    ...(match[1] ? { repository: match[1] } : {}),
  };
}

async function addGitHubSource(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  reference: string,
): Promise<boolean> {
  const runner = createGitHubCliRunner(pi);
  const locator = reference
    ? parseGitHubReference(reference)
    : {
        issueNumber:
          (await selectOrCreateGitHubIssue(pi, ctx, (message, operation) =>
            runWithLoader(ctx, message, (signal) => operation(signal)),
          )) ?? 0,
      };
  if (!locator.issueNumber) return false;
  const captured = await runWithLoader(
    ctx,
    `正在收集 GitHub Issue #${locator.issueNumber}…`,
    (signal) =>
      createGitHubIssueInboxSource(runner).capture(locator, ctx.cwd, signal),
  );
  if (!captured) return false;
  const result = captureInboxSource(ctx.cwd, captured);
  ctx.ui.notify(
    `${result.item.inbox_id} captured from ${result.item.external_key}${result.revision_created ? '' : ' (unchanged)'}.`,
    'info',
  );
  return result.revision_created;
}

async function addManualSource(
  ctx: ExtensionCommandContext,
  suppliedTitle: string,
): Promise<boolean> {
  if (!ctx.hasUI) throw new Error('Manual Inbox capture requires UI input.');
  const title =
    suppliedTitle ||
    (await ctx.ui.input('Inbox source title', 'Describe the source briefly'));
  if (title === undefined) return false;
  const body = await ctx.ui.editor('Inbox source content', '');
  if (body === undefined) return false;
  const captured = await manualTextInboxSource.capture(
    { title, body },
    ctx.cwd,
  );
  const result = captureInboxSource(ctx.cwd, captured);
  ctx.ui.notify(`${result.item.inbox_id} captured from manual text.`, 'info');
  return result.revision_created;
}

function requireInboxId(value: string): string {
  const inboxId = value.trim().toUpperCase();
  if (!/^INBOX-\d{4,}$/.test(inboxId)) {
    throw new Error('Inbox source must be INBOX-xxxx.');
  }
  return inboxId;
}

async function syncInboxSource(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  suppliedId: string,
): Promise<boolean> {
  const inboxId = requireInboxId(suppliedId);
  const item = readInboxState(ctx.cwd).items.find(
    ({ inbox_id }) => inbox_id === inboxId,
  );
  if (!item) throw new Error(`Inbox item does not exist: ${inboxId}.`);
  const revision = latestInboxRevision(ctx.cwd, inboxId);
  const captured = await runWithLoader(
    ctx,
    `正在同步 ${inboxId}…`,
    async (signal) => {
      if (item.source_kind === 'github_issue') {
        const repository = revision.provider_metadata.repository;
        const issueNumber = revision.provider_metadata.issue_number;
        if (
          typeof repository !== 'string' ||
          typeof issueNumber !== 'number' ||
          !Number.isSafeInteger(issueNumber)
        ) {
          throw new Error(`GitHub Inbox metadata is invalid: ${inboxId}.`);
        }
        return createGitHubIssueInboxSource(createGitHubCliRunner(pi)).capture(
          { repository, issueNumber },
          ctx.cwd,
          signal,
        );
      }
      if (item.source_kind === 'local_markdown') {
        const path = revision.provider_metadata.path;
        if (typeof path !== 'string') {
          throw new Error(`Local Markdown metadata is invalid: ${inboxId}.`);
        }
        return localMarkdownInboxSource.capture({ path }, ctx.cwd, signal);
      }
      throw new Error(
        `Inbox source ${inboxId} (${item.source_kind}) cannot be synchronized.`,
      );
    },
  );
  if (!captured) return false;
  if (
    captured.source_kind !== item.source_kind ||
    captured.external_key !== item.external_key
  ) {
    throw new Error(`Synchronized source identity changed for ${inboxId}.`);
  }
  const result = captureInboxSource(ctx.cwd, captured);
  ctx.ui.notify(
    result.revision_created
      ? `${inboxId} appended a new source revision.`
      : `${inboxId} is unchanged.`,
    'info',
  );
  return result.revision_created;
}

function parseExtractionSourceIds(value: string): string[] {
  const ids = value
    .split(/[\s,]+/)
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
  if (
    ids.length === 0 ||
    ids.length > 5 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !/^INBOX-\d{4,}$/.test(id))
  ) {
    throw new Error(
      'Story extraction requires one to five unique INBOX-xxxx ids.',
    );
  }
  return ids;
}

async function extractionSourceIds(
  ctx: ExtensionCommandContext,
  suppliedIds: string,
): Promise<string[] | undefined> {
  if (suppliedIds) return parseExtractionSourceIds(suppliedIds);
  if (!ctx.hasUI) {
    throw new Error('Specify the INBOX-xxxx sources to extract.');
  }
  const active = readInboxState(ctx.cwd).items.filter(
    ({ status }) => status === 'active',
  );
  if (active.length === 0) throw new Error('The Evidence Inbox is empty.');
  const selected = await ctx.ui.select(
    'Select one Inbox source to extract',
    active.map(({ inbox_id, title }) => `${inbox_id} · ${title}`),
  );
  return selected ? [selected.split(' · ')[0]] : undefined;
}

export function buildInboxExtractionTask(
  cwd: string,
  sourceIds: string[],
): string {
  const selected = sourceIds.map((sourceId) =>
    latestInboxRevision(cwd, sourceId),
  );
  return `执行一次 Evidence Inbox Story 提取。\n\n精确来源修订：\n${selected
    .map(
      (revision) =>
        `- ${revision.inbox_id} | ${revision.content_sha256} | ${revision.artifact_path}`,
    )
    .join(
      '\n',
    )}\n\n稳定产品上下文：\n- docs/product/personas.md\n- docs/product/business-context.md\n- docs/product/user-journeys.md\n- docs/product/story-map.md\n\n任务：读取全部精确来源修订，提出一至五张最小 Story 候选。每张候选引用精确 Inbox id、revision SHA-256 和 locator；候选集合必须引用全部选定来源。只调用 evidence_orchestrator_propose_inbox_stories 一次后停止；不得分配 US-xxx、确认候选或启动迭代。`;
}

async function extractStories(
  ctx: ExtensionCommandContext,
  suppliedIds: string,
  runAgent: InboxAgentRunner,
): Promise<boolean> {
  const sourceIds = await extractionSourceIds(ctx, suppliedIds);
  if (!sourceIds) return false;
  await ctx.waitForIdle();
  const result = await runWithLoader(
    ctx,
    `正在从 ${sourceIds.join(', ')} 提取 Story 候选…`,
    (signal) =>
      runAgent({
        cwd: ctx.cwd,
        agentName: 'inbox-analyst',
        task: buildInboxExtractionTask(ctx.cwd, sourceIds),
        signal,
      }),
  );
  if (!result) return false;
  if (result.exitCode !== 0) throw new Error(result.output);
  ctx.ui.notify(result.output, 'info');
  return true;
}

function decideCandidate(
  cwd: string,
  action: 'defer' | 'reject',
  input: string,
): string {
  const [candidateId = '', ...reasonParts] = input.trim().split(/\s+/);
  const reason = reasonParts.join(' ');
  const decision = recordInboxCandidateDecision(
    cwd,
    candidateId,
    action === 'defer' ? 'deferred' : 'rejected',
    reason,
  );
  return `${decision.candidate_id} ${decision.action}: ${decision.reason}`;
}

async function addMarkdownSource(
  ctx: ExtensionCommandContext,
  suppliedPath: string,
): Promise<boolean> {
  const path =
    suppliedPath ||
    (ctx.hasUI
      ? await ctx.ui.input('Project Markdown path', 'notes/interview.md')
      : undefined);
  if (path === undefined) return false;
  const captured = await localMarkdownInboxSource.capture({ path }, ctx.cwd);
  const result = captureInboxSource(ctx.cwd, captured);
  ctx.ui.notify(
    `${result.item.inbox_id} captured from ${result.item.external_key}.`,
    'info',
  );
  return result.revision_created;
}

async function addSource(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  sourceKind: SourceKind,
  rest = '',
): Promise<boolean> {
  if (sourceKind === 'github') return addGitHubSource(pi, ctx, rest);
  if (sourceKind === 'text') return addManualSource(ctx, rest);
  return addMarkdownSource(ctx, rest);
}

async function offerExtractionAfterCapture(
  ctx: ExtensionCommandContext,
  captured: boolean,
  runAgent: InboxAgentRunner,
): Promise<void> {
  if (captured && ctx.hasUI) await extractStories(ctx, '', runAgent);
}

/** Reuse the Inbox source and extraction selectors as one interactive flow. */
export async function runInboxSourceExtractionFlow(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  runAgent: InboxAgentRunner = runActivityAgent,
): Promise<boolean> {
  const activeSources = readInboxState(ctx.cwd).items.filter(
    ({ status }) => status === 'active',
  );
  if (activeSources.length === 0) {
    const sourceKind = await selectSourceKind(ctx);
    if (!sourceKind || !(await addSource(pi, ctx, sourceKind))) return false;
  }
  return extractStories(ctx, '', runAgent);
}

export function registerInboxCommands(
  pi: ExtensionAPI,
  runAgent: InboxAgentRunner = runActivityAgent,
): void {
  pi.registerCommand('evidence-inbox', {
    description: 'Collect and list provider-neutral Evidence Inbox sources',
    handler: async (args, ctx) => {
      try {
        const command = parseCommand(args);
        if (command.action === 'home') {
          if (readInboxState(ctx.cwd).items.length > 0 || !ctx.hasUI) {
            ctx.ui.notify(inboxStatus(ctx.cwd), 'info');
            return;
          }
          await runInboxSourceExtractionFlow(pi, ctx, runAgent);
          return;
        }
        if (command.action === 'list') {
          ctx.ui.notify(inboxStatus(ctx.cwd), 'info');
          return;
        }
        if (command.action === 'sync') {
          await offerExtractionAfterCapture(
            ctx,
            await syncInboxSource(pi, ctx, command.rest),
            runAgent,
          );
          return;
        }
        if (command.action === 'extract') {
          await extractStories(ctx, command.rest, runAgent);
          return;
        }
        if (command.action === 'defer' || command.action === 'reject') {
          ctx.ui.notify(
            decideCandidate(ctx.cwd, command.action, command.rest),
            'info',
          );
          return;
        }
        const sourceKind = command.sourceKind ?? (await selectSourceKind(ctx));
        if (sourceKind) {
          await offerExtractionAfterCapture(
            ctx,
            await addSource(pi, ctx, sourceKind, command.rest),
            runAgent,
          );
        }
      } catch (error) {
        ctx.ui.notify(
          error instanceof Error ? error.message : String(error),
          'error',
        );
      }
    },
  });
}
