import { Container, Spacer, Text } from '@earendil-works/pi-tui';
import type { ActivityExecutionDetails } from './execution';

export type ActivitySubagentToolDetails = ActivityExecutionDetails;

type RecordValue = Record<string, unknown>;

type DisplayItem =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; args: unknown };

interface ThemeLike {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

interface ResultOptions {
  expanded: boolean;
  isPartial?: boolean;
  showExpandHint?: boolean;
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function preview(value: string, maxLength = 100): string {
  const compact = value.trim().replace(/\s+/g, ' ');
  return compact.length > maxLength
    ? `${compact.slice(0, maxLength - 3)}...`
    : compact;
}

function firstLines(value: string, maxLines = 3): string {
  const lines = value.trim().split('\n');
  const shown = lines.slice(0, maxLines).join('\n');
  return lines.length > maxLines ? `${shown}\n...` : shown;
}

function isClarificationQuestion(value: string): boolean {
  return /^TQA Q-\d+ · US-\d+\n\n/.test(value);
}

function resultText(result: unknown): string {
  if (!isRecord(result) || !Array.isArray(result.content)) return '';
  return result.content
    .filter(
      (part): part is RecordValue =>
        isRecord(part) && part.type === 'text' && typeof part.text === 'string',
    )
    .map((part) => part.text as string)
    .join('\n');
}

function activityDetails(
  result: unknown,
): ActivitySubagentToolDetails | undefined {
  if (!isRecord(result) || !isRecord(result.details)) return undefined;
  const details = result.details;
  if (
    typeof details.activity !== 'string' ||
    typeof details.agent !== 'string' ||
    typeof details.model !== 'string' ||
    typeof details.thinking !== 'string' ||
    typeof details.output !== 'string' ||
    !Array.isArray(details.messages) ||
    typeof details.exitCode !== 'number' ||
    typeof details.stderr !== 'string'
  ) {
    return undefined;
  }

  return {
    activity: details.activity as ActivityExecutionDetails['activity'],
    agent: details.agent,
    model: details.model,
    thinking: details.thinking as ActivityExecutionDetails['thinking'],
    output: details.output,
    messages: details.messages as ActivityExecutionDetails['messages'],
    exitCode: details.exitCode,
    stderr: details.stderr,
    task: asText(details.task) ?? '',
    status:
      details.status === 'running' || details.exitCode === -1
        ? 'running'
        : details.status === 'failed' || details.exitCode !== 0
          ? 'failed'
          : 'completed',
  };
}

export function isActivitySubagentFailureDetails(details: unknown): boolean {
  const record = isRecord(details) ? details : undefined;
  return typeof record?.exitCode === 'number' && record.exitCode !== 0;
}

function displayItems(messages: readonly unknown[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  for (const message of messages) {
    if (!isRecord(message) || message.role !== 'assistant') continue;
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (!isRecord(part)) continue;
      if (part.type === 'text' && typeof part.text === 'string') {
        items.push({ type: 'text', text: part.text });
      }
      if (part.type === 'toolCall' && typeof part.name === 'string') {
        items.push({ type: 'tool', name: part.name, args: part.arguments });
      }
    }
  }
  return items;
}

function formatToolCall(name: string, args: unknown): string {
  const input = isRecord(args) ? args : {};
  const path = asText(input.path) ?? '...';

  switch (name) {
    case 'bash':
      return `$ ${preview(asText(input.command) ?? '...', 90)}`;
    case 'read': {
      const offset =
        typeof input.offset === 'number' ? input.offset : undefined;
      const limit = typeof input.limit === 'number' ? input.limit : undefined;
      const range =
        offset === undefined && limit === undefined
          ? ''
          : `:${offset ?? 1}${limit === undefined ? '' : `-${(offset ?? 1) + limit - 1}`}`;
      return `read ${path}${range}`;
    }
    case 'write':
      return `write ${path}`;
    case 'edit': {
      const edits = Array.isArray(input.edits) ? input.edits.length : 1;
      return `edit ${path} (${edits} change${edits === 1 ? '' : 's'})`;
    }
    case 'grep':
      return `grep /${asText(input.pattern) ?? ''}/ in ${asText(input.path) ?? '.'}`;
    case 'find':
      return `find ${asText(input.pattern) ?? '*'} in ${asText(input.path) ?? '.'}`;
    case 'ls':
      return `ls ${asText(input.path) ?? '.'}`;
    default: {
      let serialized = '';
      try {
        serialized = JSON.stringify(args);
      } catch {
        serialized = '[unserializable arguments]';
      }
      return `${name}${serialized ? ` ${preview(serialized, 80)}` : ''}`;
    }
  }
}

function renderItems(
  items: readonly DisplayItem[],
  theme: ThemeLike,
  limit?: number,
): string {
  const visible = limit ? items.slice(-limit) : items;
  const skipped = items.length - visible.length;
  const lines: string[] = [];
  if (skipped > 0) {
    lines.push(theme.fg('muted', `... ${skipped} earlier child event(s)`));
  }
  for (const item of visible) {
    if (item.type === 'tool') {
      lines.push(
        theme.fg('muted', '→ ') +
          theme.fg('accent', formatToolCall(item.name, item.args)),
      );
    } else if (item.text.trim()) {
      lines.push(theme.fg('toolOutput', firstLines(item.text)));
    }
  }
  return lines.join('\n');
}

export function renderActivitySubagentCall(
  args: unknown,
  theme: ThemeLike,
): Text {
  const instructions = isRecord(args) ? asText(args.instructions) : undefined;
  let text = theme.fg('toolTitle', theme.bold('Evidence activity subagent'));
  if (instructions?.trim()) {
    text += theme.fg('dim', ` · ${preview(instructions, 72)}`);
  }
  return new Text(text, 0, 0);
}

/**
 * Keep child activity in tool-result details and render it locally. The parent
 * model receives only the child’s final response in `content`, avoiding a
 * transcript-sized context injection while preserving full TUI observability.
 */
export function renderActivitySubagentResult(
  result: unknown,
  options: ResultOptions,
  theme: ThemeLike,
): Container | Text {
  const details = activityDetails(result);
  if (!details) {
    return new Text(
      theme.fg('toolOutput', resultText(result) || '(no output)'),
      0,
      0,
    );
  }

  const items = displayItems(details.messages);
  const running =
    options.isPartial === true ||
    details.status === 'running' ||
    details.exitCode === -1;
  const failed = !running && details.status === 'failed';
  const icon = running
    ? theme.fg('warning', '⏳')
    : failed
      ? theme.fg('error', '✗')
      : theme.fg('success', '✓');
  const header =
    `${icon} ${theme.fg('toolTitle', theme.bold(details.activity))}` +
    theme.fg('accent', ` · ${details.agent}`) +
    theme.fg('dim', ` · ${details.model} · thinking=${details.thinking}`);
  const activityItems = options.expanded
    ? items.filter((item) => item.type === 'tool')
    : items;
  const activity = renderItems(
    activityItems,
    theme,
    options.expanded ? undefined : 8,
  );

  if (options.expanded) {
    const container = new Container();
    container.addChild(new Text(header, 0, 0));
    if (details.task) {
      container.addChild(new Spacer(1));
      container.addChild(
        new Text(theme.fg('muted', '─── Delegated task ───'), 0, 0),
      );
      container.addChild(new Text(theme.fg('dim', details.task), 0, 0));
    }
    if (activity) {
      container.addChild(new Spacer(1));
      container.addChild(
        new Text(theme.fg('muted', '─── Child activity ───'), 0, 0),
      );
      container.addChild(new Text(activity, 0, 0));
    }
    if (details.output && details.output !== '(running...)') {
      container.addChild(new Spacer(1));
      container.addChild(
        new Text(
          theme.fg(
            'muted',
            running
              ? '─── Latest child response ───'
              : '─── Final child output ───',
          ),
          0,
          0,
        ),
      );
      container.addChild(
        new Text(theme.fg('toolOutput', details.output), 0, 0),
      );
    }
    if (details.stderr.trim()) {
      container.addChild(new Spacer(1));
      container.addChild(
        new Text(theme.fg('warning', '─── Child stderr ───'), 0, 0),
      );
      container.addChild(
        new Text(theme.fg('warning', details.stderr.trim()), 0, 0),
      );
    }
    return container;
  }

  const showClarificationQuestion =
    !running && isClarificationQuestion(details.output);
  let text = header;
  if (activity && !showClarificationQuestion) {
    text += `\n${activity}`;
  } else if (running) {
    text += `\n${theme.fg('muted', '(waiting for child events...)')}`;
  } else if (details.output) {
    text += `\n${theme.fg(
      'toolOutput',
      showClarificationQuestion ? details.output : firstLines(details.output),
    )}`;
  } else {
    text += `\n${theme.fg('muted', '(no output)')}`;
  }
  if (details.stderr.trim()) {
    text += `\n${theme.fg('warning', preview(details.stderr, 160))}`;
  }
  if (
    !showClarificationQuestion &&
    items.length > 8 &&
    options.showExpandHint !== false
  ) {
    text += `\n${theme.fg('muted', '(Ctrl+O to expand)')}`;
  }
  return new Text(text, 0, 0);
}
