import type { UIMessage } from 'ai';
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
  summary: string | null;
  changes: Record<ChangeKey, unknown[]>;
};

export function DiagramAssistantMessage({
  isStreaming = false,
  message,
}: {
  isStreaming?: boolean;
  message: UIMessage;
}) {
  const proposal = proposalFromMessage(message);

  return (
    <Message from={message.role}>
      <MessageContent className="w-full">
        {message.parts.map((part, index) =>
          renderPart({
            hideProposalTool: Boolean(proposal),
            isStreaming,
            key: `${message.id}-${index}`,
            part,
          }),
        )}
        {proposal
          ? renderProposalPart(`${message.id}-modeling-proposal`, proposal)
          : null}
      </MessageContent>
    </Message>
  );
}

function renderPart({
  hideProposalTool,
  isStreaming,
  key,
  part,
}: {
  hideProposalTool: boolean;
  isStreaming: boolean;
  key: string;
  part: MessagePart;
}) {
  if (part.type === 'text') {
    return <MessageResponse key={key}>{part.text}</MessageResponse>;
  }

  if (part.type === 'reasoning') {
    return (
      <Reasoning className="w-full" isStreaming={isStreaming} key={key}>
        <ReasoningTrigger />
        <ReasoningContent>{part.text}</ReasoningContent>
      </Reasoning>
    );
  }

  if (isToolPart(part)) {
    if (hideProposalTool && isModelingProposalToolPart(part)) {
      return null;
    }

    return renderToolPart(key, part);
  }

  if (isDataPart(part)) {
    return renderDataPart(key, part);
  }

  return null;
}

function renderProposalPart(key: string, proposal: ProposalView) {
  return (
    <div className="space-y-3 rounded-lg border bg-background p-3" key={key}>
      <div className="text-sm font-medium">Modeling proposal</div>
      <MessageResponse>{proposalMarkdown(proposal)}</MessageResponse>
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
    </div>
  );
}

function renderToolPart(key: string, part: MessagePart) {
  const tool = part as ToolPart;
  const toolRecord = record(part) ?? {};
  const state = toolState(toolRecord.state);
  const type = stringValue(toolRecord.type) ?? 'dynamic-tool';
  const isDynamicTool = type === 'dynamic-tool';
  const isModelingProposalTool = isModelingProposalToolPart(part);

  return (
    <Tool
      defaultOpen={isModelingProposalTool || state.startsWith('output-')}
      key={key}
    >
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
        {tool.input !== undefined ? <ToolInput input={tool.input} /> : null}
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

function proposalFromMessage(
  message: Pick<UIMessage, 'parts'>,
): ProposalView | null {
  return (
    message.parts
      .map(proposalFromToolPart)
      .find((proposal) => proposal !== null) ?? null
  );
}

function proposalFromToolPart(part: MessagePart): ProposalView | null {
  if (!isModelingProposalToolPart(part)) {
    return null;
  }

  const partRecord = record(part);
  const output = record(partRecord?.output);
  const outputDetails = record(output?.details);
  return proposalFromRecord(outputDetails?.proposal);
}

function proposalFromRecord(proposalValue: unknown): ProposalView | null {
  const proposal = record(proposalValue);
  const changes = record(proposal?.changes);
  if (!proposal || !changes) {
    return null;
  }

  return {
    rawText: JSON.stringify(proposal, null, 2),
    summary: stringValue(proposal.summary),
    changes: Object.fromEntries(
      CHANGE_KEYS.map((key) => [key, arrayValue(changes[key])]),
    ) as Record<ChangeKey, unknown[]>,
  };
}

function isModelingProposalToolPart(part: MessagePart): boolean {
  return modelingProposalToolName(part) === 'submit_modeling_proposal';
}

function modelingProposalToolName(part: MessagePart): string | null {
  if (!isToolPart(part)) {
    return null;
  }

  const partRecord = record(part);
  return (
    stringValue(partRecord?.toolName) ??
    (part.type.startsWith('tool-') ? part.type.slice('tool-'.length) : null)
  );
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
