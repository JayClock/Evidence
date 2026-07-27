import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  InboxExtractionResource,
  InboxItemCollectionResource,
  State,
} from '@evidence/api-client';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
} from '@evidence/ui';
import type { InboxSourceSelection } from './inbox-source-browser';

export function InboxExtractionControls({
  collectionState,
  selectedSources,
  onClear,
}: {
  collectionState: State<InboxItemCollectionResource>;
  selectedSources: InboxSourceSelection[];
  onClear: () => void;
}) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bridge = window.evidenceDesktop;
  const selectionIsValid =
    selectedSources.length >= 1 && selectedSources.length <= 5;

  const extract = async () => {
    if (pending || !selectionIsValid || !bridge?.runInboxAnalyst) return;
    setPending(true);
    setError(null);
    setProgress('正在冻结所选来源的精确 latest Revision…');
    try {
      const extraction = (await collectionState
        .follow('inbox-extractions')
        .post({
          data: { inboxItemIds: selectedSources.map((source) => source.id) },
        })) as State<InboxExtractionResource>;
      const workspaceId = workspaceIdFromState(extraction);
      await bridge.runInboxAnalyst(
        {
          id: requestId('inbox'),
          workspaceId,
          extractionId: extraction.data.id,
        },
        (event) => {
          if (event.event === 'progress') setProgress(event.data);
          if (event.event === 'tool-start') {
            setProgress('正在提交受 Extraction 约束的 Candidate 集合…');
          }
          if (event.event === 'error') setError(event.data);
        },
      );
      const href = extraction.getLink('story-candidates')?.href;
      if (!href) throw new Error('Extraction 缺少 story-candidates relation。');
      navigate(href);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
      setProgress(null);
    }
  };

  return (
    <Card className="shrink-0 border-primary/20 py-3">
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{selectedSources.length} / 5</Badge>
            <p className="font-medium">个 active 来源已选</p>
            <span className="text-xs text-muted-foreground">
              下一步将冻结精确 Revision，不会读取后续 live 变化。
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedSources.map((source) => (
              <Badge
                key={source.id}
                title={source.latestRevisionSha256}
                variant="outline"
              >
                {source.title}
              </Badge>
            ))}
          </div>
          {!bridge?.runInboxAnalyst ? (
            <p className="text-xs text-muted-foreground">
              请在已绑定本地仓库的 Evidence Desktop 中运行 Inbox Analyst。
            </p>
          ) : null}
          {progress ? (
            <p aria-live="polite" className="text-xs text-muted-foreground">
              {progress}
            </p>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            disabled={pending}
            type="button"
            variant="outline"
            onClick={onClear}
          >
            清空
          </Button>
          <Button
            disabled={pending || !selectionIsValid || !bridge?.runInboxAnalyst}
            type="button"
            onClick={() => void extract()}
          >
            {pending ? '分析中…' : '冻结修订并分析'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function workspaceIdFromState(state: State<InboxExtractionResource>): string {
  const href = state.getLink('workspace')?.href;
  const match = href && /\/workspaces\/([^/?#]+)/.exec(href);
  if (!match?.[1]) throw new Error('Extraction 缺少 Workspace relation。');
  return decodeURIComponent(match[1]);
}

function requestId(prefix: string): string {
  const value = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
  return `${prefix}:${value}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : '无法分析所选 Inbox 来源，请重试。';
}
