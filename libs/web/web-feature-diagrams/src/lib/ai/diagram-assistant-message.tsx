import type { UIMessage } from 'ai';
import { parse as parseJsonBestEffort } from 'best-effort-json-parser';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@evidence/ui';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@evidence/ui/ai-elements/message';

const CHANGE_KEYS = [
  'addNodes',
  'updateNodes',
  'deleteNodes',
  'addEdges',
  'updateEdges',
  'deleteEdges',
] as const;

type ChangeKey = (typeof CHANGE_KEYS)[number];

type ProposalView = {
  rawText: string;
  summary: string | null;
  changes: Record<ChangeKey, unknown[]>;
};

export function DiagramAssistantMessage({ message }: { message: UIMessage }) {
  const text = messageText(message);

  if (message.role !== 'assistant') {
    return (
      <Message from={message.role}>
        <MessageContent>
          <MessageResponse>{text}</MessageResponse>
        </MessageContent>
      </Message>
    );
  }

  const proposal = proposalView(text);

  return (
    <Message from="assistant">
      <MessageContent className="w-full">
        {proposal ? (
          <ProposalCard proposal={proposal} />
        ) : (
          <ParsingFallback rawText={text} />
        )}
      </MessageContent>
    </Message>
  );
}

function ProposalCard({ proposal }: { proposal: ProposalView }) {
  const addedNodes = records(proposal.changes.addNodes);
  const addedEdges = records(proposal.changes.addEdges);

  return (
    <Card className="w-full bg-background/80">
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Modeling proposal</CardTitle>
          <Badge variant="secondary">Streaming</Badge>
        </div>
        <CardDescription>
          AI output is advisory and has not been applied.
        </CardDescription>
        {proposal.summary ? (
          <p className="text-sm">{proposal.summary}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          {CHANGE_KEYS.map((key) => (
            <div className="rounded-lg border bg-muted/30 p-2" key={key}>
              <dt className="text-muted-foreground">{key}</dt>
              <dd className="font-medium">{proposal.changes[key].length}</dd>
            </div>
          ))}
        </dl>

        {addedNodes.length > 0 ? (
          <section className="space-y-2">
            <h4 className="font-medium text-sm">Proposed nodes</h4>
            <ul className="space-y-2">
              {addedNodes.map((node, index) => (
                <li
                  className="rounded-lg border p-2 text-sm"
                  key={nodeId(node, index)}
                >
                  <div className="font-medium">{nodeName(node)}</div>
                  {nodeLabel(node) ? (
                    <div className="text-muted-foreground">
                      {nodeLabel(node)}
                    </div>
                  ) : null}
                  <div className="text-muted-foreground">{nodeType(node)}</div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {addedEdges.length > 0 ? (
          <section className="space-y-2">
            <h4 className="font-medium text-sm">Proposed edges</h4>
            <ul className="space-y-2">
              {addedEdges.map((edge, index) => (
                <li
                  className="rounded-lg border p-2 text-sm"
                  key={edgeId(edge, index)}
                >
                  <div className="font-medium">{edgeEndpoints(edge)}</div>
                  {stringValue(edge.relationType) ? (
                    <div className="text-muted-foreground">
                      {stringValue(edge.relationType)}
                    </div>
                  ) : null}
                  {stringValue(edge.label) ? (
                    <div>{stringValue(edge.label)}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <details className="rounded-lg border p-2 text-sm">
          <summary className="cursor-pointer font-medium">Raw JSON</summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">
            {proposal.rawText}
          </pre>
        </details>
      </CardContent>
    </Card>
  );
}

function ParsingFallback({ rawText }: { rawText: string }) {
  return (
    <Card className="w-full bg-background/80">
      <CardHeader>
        <CardTitle>Parsing streamed JSON…</CardTitle>
        <CardDescription>
          Waiting for the stream to form a ModelingProposal shape.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">
          {rawText || 'No assistant text received yet.'}
        </pre>
      </CardContent>
    </Card>
  );
}

function proposalView(rawText: string): ProposalView | null {
  if (!rawText.trim()) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = parseJsonBestEffort(rawText);
  } catch {
    return null;
  }

  const proposal = record(parsed);
  if (!proposal) {
    return null;
  }

  const changes = record(proposal.changes);
  if (!changes) {
    return null;
  }

  return {
    rawText,
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

function nodeId(node: Record<string, unknown>, index: number): string {
  return stringValue(node.id) ?? `node-${index}`;
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

function edgeId(edge: Record<string, unknown>, index: number): string {
  return stringValue(edge.id) ?? `edge-${index}`;
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
