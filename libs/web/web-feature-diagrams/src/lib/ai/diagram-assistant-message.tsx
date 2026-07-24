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

const TOOL_STATES = [
  'approval-requested',
  'approval-responded',
  'input-available',
  'input-streaming',
  'output-available',
  'output-denied',
  'output-error',
] as const satisfies ToolPart['state'][];

type MessagePart = UIMessage['parts'][number];
type ToolState = ToolPart['state'];

export function DiagramAssistantMessage({
  isStreaming = false,
  message,
}: {
  isStreaming?: boolean;
  message: UIMessage;
}) {
  return (
    <Message from={message.role}>
      <MessageContent className="w-full">
        {message.parts.map((part, index) =>
          renderPart({
            isStreaming,
            key: `${message.id}-${index}`,
            part,
          }),
        )}
      </MessageContent>
    </Message>
  );
}

function renderPart({
  isStreaming,
  key,
  part,
}: {
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
    return renderToolPart(key, part);
  }

  if (isDataPart(part)) {
    return renderDataPart(key, part);
  }

  return null;
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

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}
