import type { UIMessage } from 'ai';
import { parse as parseJsonBestEffort } from 'best-effort-json-parser';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@evidence/ui/ai-elements/code-block';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@evidence/ui/ai-elements/message';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@evidence/ui/ai-elements/reasoning';
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from '@evidence/ui/ai-elements/tool';

const CHANGE_KEYS = [
  'addNodes',
  'updateNodes',
  'deleteNodes',
  'addEdges',
  'updateEdges',
  'deleteEdges',
] as const;

const TOOL_STATES = [
  'approval-requested',
  'approval-responded',
  'input-available',
  'input-streaming',
  'output-available',
  'output-denied',
  'output-error',
] as const satisfies ToolPart['state'][];

type ChangeKey = (typeof CHANGE_KEYS)[number];
type MessagePart = UIMessage['parts'][number];
type ToolState = ToolPart['state'];

type ProposalView = {
  rawText: string;
  source: 'streaming' | 'final';
  summary: string | null;
  changes: Record<ChangeKey, unknown[]>;
};

type ProposalDeltaPayload =
  | { kind: 'summary'; summary: string }
  | { kind: 'change'; changeKey: ChangeKey; item: unknown };

export function DiagramAssistantMessage({
  isStreaming = false,
  message,
}: {
  isStreaming?: boolean;
  message: UIMessage;
}) {
  const text = messageText(message);
  const finalProposal = finalProposalView(message);
  const streamingProposal =
    finalProposal || isStreaming ? null : proposalView(text);
  const progressProposal =
    finalProposal || streamingProposal ? null : proposalProgressView(message);

  return (
    <Message from={message.role}>
      <MessageContent className="w-full">
        {message.parts.map((part, index) =>
          renderPart({
            hideText: Boolean(
              finalProposal || streamingProposal || progressProposal,
            ),
            isStreaming,
            key: `${message.id}-${index}`,
            part,
          }),
        )}
        {progressProposal
          ? renderProposalPart(
              `${message.id}-proposal-progress`,
              progressProposal,
            )
          : null}
        {streamingProposal
          ? renderProposalPart(
              `${message.id}-streaming-proposal`,
              streamingProposal,
            )
          : null}
      </MessageContent>
    </Message>
  );
}

function renderPart({
  hideText,
  isStreaming,
  key,
  part,
}: {
  hideText: boolean;
  isStreaming: boolean;
  key: string;
  part: MessagePart;
}) {
  if (part.type === 'text') {
    return hideText ? null : (
      <MessageResponse key={key}>{part.text}</MessageResponse>
    );
  }

  if (part.type === 'reasoning') {
    return (
      <Reasoning className="w-full" isStreaming={isStreaming} key={key}>
        <ReasoningTrigger />
        <ReasoningContent>{part.text}</ReasoningContent>
      </Reasoning>
    );
  }

  if (isProposalDataPart(part)) {
    const proposal = proposalFromRecord(
      part.data,
      JSON.stringify(part.data, null, 2),
      'final',
    );
    return proposal ? renderProposalPart(key, proposal) : null;
  }

  if (isProposalDeltaDataPart(part)) {
    return null;
  }

  if (isToolPart(part)) {
    return renderToolPart(key, part);
  }

  if (isDataPart(part)) {
    return renderDataPart(key, part);
  }

  return null;
}

function renderProposalPart(key: string, proposal: ProposalView) {
  return (
    <Tool defaultOpen key={key}>
      <ToolHeader
        state={
          proposal.source === 'final' ? 'output-available' : 'input-available'
        }
        title={`Modeling proposal · ${proposal.source === 'final' ? 'Final' : 'Streaming'}`}
        type="tool-diagram-model-proposal"
      />
      <ToolContent>
        <ToolOutput
          errorText={undefined}
          output={
            <MessageResponse>{proposalMarkdown(proposal)}</MessageResponse>
          }
        />
        <CodeBlock code={proposal.rawText} language="json">
          <CodeBlockHeader>
            <CodeBlockTitle>
              <CodeBlockFilename>proposal.json</CodeBlockFilename>
            </CodeBlockTitle>
            <CodeBlockActions>
              <CodeBlockCopyButton />
            </CodeBlockActions>
          </CodeBlockHeader>
        </CodeBlock>
      </ToolContent>
    </Tool>
  );
}

function renderToolPart(key: string, part: MessagePart) {
  const tool = part as ToolPart;
  const toolRecord = record(part) ?? {};
  const state = toolState(toolRecord.state);
  const type = stringValue(toolRecord.type) ?? 'dynamic-tool';
  const isDynamicTool = type === 'dynamic-tool';

  return (
    <Tool defaultOpen={state.startsWith('output-')} key={key}>
      {isDynamicTool ? (
        <ToolHeader
          state={state}
          toolName={stringValue(toolRecord.toolName) ?? 'tool'}
          type="dynamic-tool"
        />
      ) : (
        <ToolHeader state={state} type={type as `tool-${string}`} />
      )}
      <ToolContent>
        {'input' in tool ? <ToolInput input={tool.input} /> : null}
        <ToolOutput errorText={tool.errorText} output={tool.output} />
      </ToolContent>
    </Tool>
  );
}

function renderDataPart(key: string, part: MessagePart) {
  const partRecord = record(part);
  const type = stringValue(partRecord?.type) ?? 'data';
  const data = partRecord && 'data' in partRecord ? partRecord.data : part;

  return (
    <CodeBlock code={JSON.stringify(data, null, 2)} key={key} language="json">
      <CodeBlockHeader>
        <CodeBlockTitle>
          <CodeBlockFilename>{type}.json</CodeBlockFilename>
        </CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton />
        </CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
  );
}

function proposalMarkdown(proposal: ProposalView): string {
  const counts = CHANGE_KEYS.map(
    (key) => `| ${key} | ${proposal.changes[key].length} |`,
  ).join('\n');
  const nodes = records(proposal.changes.addNodes)
    .map(
      (node) =>
        `- **${nodeName(node)}**${nodeLabel(node) ? ` — ${nodeLabel(node)}` : ''} (${nodeType(node)})`,
    )
    .join('\n');
  const edges = records(proposal.changes.addEdges)
    .map(
      (edge) =>
        `- **${edgeEndpoints(edge)}**${stringValue(edge.relationType) ? ` — ${stringValue(edge.relationType)}` : ''}${stringValue(edge.label) ? `: ${stringValue(edge.label)}` : ''}`,
    )
    .join('\n');

  return [
    'AI output is advisory and has not been applied.',
    proposal.summary,
    '### Change counts',
    '| Change | Count |',
    '| --- | ---: |',
    counts,
    nodes ? `### Proposed nodes\n${nodes}` : null,
    edges ? `### Proposed edges\n${edges}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function proposalView(rawText: string): ProposalView | null {
  const trimmed = rawText.trim();
  if (!trimmed || !trimmed.startsWith('{')) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = parseJsonBestEffort(trimmed);
  } catch {
    return null;
  }

  const proposal = record(parsed);
  if (!proposal) {
    return null;
  }

  return proposalFromRecord(proposal, rawText, 'streaming');
}

function finalProposalView(
  message: Pick<UIMessage, 'parts'>,
): ProposalView | null {
  const part = message.parts.find(isProposalDataPart);
  if (!part) {
    return null;
  }

  return proposalFromRecord(
    part.data,
    JSON.stringify(part.data, null, 2),
    'final',
  );
}

function proposalProgressView(
  message: Pick<UIMessage, 'parts'>,
): ProposalView | null {
  const deltas = message.parts
    .filter(isProposalDeltaDataPart)
    .map((part) => part.data);
  if (deltas.length === 0) {
    return null;
  }

  const changes: Record<ChangeKey, unknown[]> = {
    addNodes: [],
    updateNodes: [],
    deleteNodes: [],
    addEdges: [],
    updateEdges: [],
    deleteEdges: [],
  };
  let summary: string | null = null;

  for (const delta of deltas) {
    if (delta.kind === 'summary') {
      summary = delta.summary;
      continue;
    }

    changes[delta.changeKey].push(delta.item);
  }

  return {
    rawText: JSON.stringify({ summary, changes }, null, 2),
    source: 'streaming',
    summary,
    changes,
  };
}

function proposalFromRecord(
  proposalValue: unknown,
  rawText: string,
  source: ProposalView['source'],
): ProposalView | null {
  const proposal = record(proposalValue);
  const changes = record(proposal?.changes);
  if (!proposal || !changes) {
    return null;
  }

  return {
    rawText,
    source,
    summary: stringValue(proposal.summary),
    changes: Object.fromEntries(
      CHANGE_KEYS.map((key) => [key, arrayValue(changes[key])]),
    ) as Record<ChangeKey, unknown[]>,
  };
}

function messageText(message: Pick<UIMessage, 'parts'>): string {
  return message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim();
}

function isProposalDataPart(
  part: MessagePart,
): part is MessagePart & { data: unknown; type: 'data-proposal' } {
  return part.type === 'data-proposal' && 'data' in part;
}

function isProposalDeltaDataPart(part: MessagePart): part is MessagePart & {
  data: ProposalDeltaPayload;
  type: 'data-proposal-delta';
} {
  if (part.type !== 'data-proposal-delta' || !('data' in part)) {
    return false;
  }

  const data = record(part.data);
  if (data?.kind === 'summary') {
    return typeof data.summary === 'string';
  }

  return data?.kind === 'change' && isChangeKey(data.changeKey);
}

function isChangeKey(value: unknown): value is ChangeKey {
  return CHANGE_KEYS.includes(value as ChangeKey);
}

function isDataPart(part: MessagePart): boolean {
  return part.type.startsWith('data-') && 'data' in part;
}

function isToolPart(part: MessagePart): boolean {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

function toolState(value: unknown): ToolState {
  return TOOL_STATES.includes(value as ToolState)
    ? (value as ToolState)
    : 'input-available';
}

function nodeName(node: Record<string, unknown>): string {
  return (
    stringValue(record(node.data)?.name) ??
    stringValue(node.id) ??
    'Unnamed node'
  );
}

function nodeLabel(node: Record<string, unknown>): string | null {
  return stringValue(record(node.data)?.label);
}

function nodeType(node: Record<string, unknown>): string {
  const data = record(node.data);
  const type = stringValue(data?.type) ?? 'unknown';
  const subType = stringValue(data?.subType) ?? stringValue(data?.sub_type);
  return subType ? `${type} / ${subType}` : type;
}

function edgeEndpoints(edge: Record<string, unknown>): string {
  const source = stringValue(record(edge.source)?.id) ?? 'unknown-source';
  const target = stringValue(record(edge.target)?.id) ?? 'unknown-target';
  return `${source} → ${target}`;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function records(values: unknown[]): Record<string, unknown>[] {
  return values.flatMap((value) => {
    const item = record(value);
    return item ? [item] : [];
  });
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}
