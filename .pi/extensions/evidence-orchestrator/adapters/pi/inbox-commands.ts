import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';
import {
  captureInboxSource,
  readInboxState,
} from '../../capabilities/inbox/repository';
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
  action: 'list' | 'add';
  sourceKind?: SourceKind;
  rest: string;
}

function parseCommand(args: string): ParsedInboxCommand {
  const tokens = args.trim() ? args.trim().split(/\s+/) : [];
  const [action = 'list', sourceKind, ...rest] = tokens;
  if (action === 'list' || action === 'status') {
    return { action: 'list', rest: '' };
  }
  if (action !== 'add') {
    throw new Error('Usage: /evidence-inbox [list | add github|text|file].');
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
  const items = state.items.map(
    (item) =>
      `- ${item.inbox_id} · ${item.source_kind} · ${item.title} · ${item.revision_paths.length} revision(s) · ${item.status}`,
  );
  return [
    '# Evidence Inbox',
    '',
    `Items: ${state.items.length}`,
    '',
    items.length ? items.join('\n') : '- empty',
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
): Promise<void> {
  const runner = createGitHubCliRunner(pi);
  const locator = reference
    ? parseGitHubReference(reference)
    : {
        issueNumber:
          (await selectOrCreateGitHubIssue(pi, ctx, (message, operation) =>
            runWithLoader(ctx, message, (signal) => operation(signal)),
          )) ?? 0,
      };
  if (!locator.issueNumber) return;
  const captured = await runWithLoader(
    ctx,
    `正在收集 GitHub Issue #${locator.issueNumber}…`,
    (signal) =>
      createGitHubIssueInboxSource(runner).capture(locator, ctx.cwd, signal),
  );
  if (!captured) return;
  const result = captureInboxSource(ctx.cwd, captured);
  ctx.ui.notify(
    `${result.item.inbox_id} captured from ${result.item.external_key}${result.revision_created ? '' : ' (unchanged)'}.`,
    'info',
  );
}

async function addManualSource(
  ctx: ExtensionCommandContext,
  suppliedTitle: string,
): Promise<void> {
  if (!ctx.hasUI) throw new Error('Manual Inbox capture requires UI input.');
  const title =
    suppliedTitle ||
    (await ctx.ui.input('Inbox source title', 'Describe the source briefly'));
  if (title === undefined) return;
  const body = await ctx.ui.editor('Inbox source content', '');
  if (body === undefined) return;
  const captured = await manualTextInboxSource.capture(
    { title, body },
    ctx.cwd,
  );
  const result = captureInboxSource(ctx.cwd, captured);
  ctx.ui.notify(`${result.item.inbox_id} captured from manual text.`, 'info');
}

async function addMarkdownSource(
  ctx: ExtensionCommandContext,
  suppliedPath: string,
): Promise<void> {
  const path =
    suppliedPath ||
    (ctx.hasUI
      ? await ctx.ui.input('Project Markdown path', 'notes/interview.md')
      : undefined);
  if (path === undefined) return;
  const captured = await localMarkdownInboxSource.capture({ path }, ctx.cwd);
  const result = captureInboxSource(ctx.cwd, captured);
  ctx.ui.notify(
    `${result.item.inbox_id} captured from ${result.item.external_key}.`,
    'info',
  );
}

export function registerInboxCommands(pi: ExtensionAPI): void {
  pi.registerCommand('evidence-inbox', {
    description: 'Collect and list provider-neutral Evidence Inbox sources',
    handler: async (args, ctx) => {
      try {
        const command = parseCommand(args);
        if (command.action === 'list') {
          ctx.ui.notify(inboxStatus(ctx.cwd), 'info');
          return;
        }
        const sourceKind = command.sourceKind ?? (await selectSourceKind(ctx));
        if (!sourceKind) return;
        if (sourceKind === 'github') {
          await addGitHubSource(pi, ctx, command.rest);
        } else if (sourceKind === 'text') {
          await addManualSource(ctx, command.rest);
        } else {
          await addMarkdownSource(ctx, command.rest);
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
