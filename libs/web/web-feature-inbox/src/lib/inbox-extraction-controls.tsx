import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  InboxExtractionResource,
  InboxItemCollectionResource,
  State,
} from '@evidence/api-client';
import { Badge, Button, Card, CardContent } from '@evidence/ui';
import { LockIcon, SparklesIcon } from 'lucide-react';
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

  const desktopUnavailable = !bridge?.runInboxAnalyst;
  const detail =
    error ??
    progress ??
    (desktopUnavailable
      ? '需要已绑定本地仓库的 Evidence Desktop'
      : '冻结精确最新修订，不读取后续变化');

  return (
    <Card className="pointer-events-auto h-14 w-full max-w-[49.25rem] shrink-0 border-primary/20 py-0 shadow-lg">
      <CardContent className="flex h-full items-center gap-3 px-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <SparklesIcon aria-hidden className="size-4" />
        </span>
        <div className="flex w-48 min-w-0 shrink-0 flex-col gap-0.5">
          <p className="truncate text-[0.6875rem] font-semibold">
            {selectedSources.length} / 5 个活跃来源已选
          </p>
          <p
            aria-live={progress || error ? 'polite' : undefined}
            className="truncate text-[0.6875rem] text-muted-foreground data-[error=true]:text-destructive"
            data-error={Boolean(error)}
          >
            {detail}
          </p>
        </div>
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-hidden">
          {selectedSources.map((source) => (
            <Badge
              className="max-w-32 shrink truncate"
              key={source.id}
              title={source.latestRevisionSha256}
              variant="outline"
            >
              {source.title}
            </Badge>
          ))}
        </div>
        <Button
          disabled={pending}
          onClick={onClear}
          size="sm"
          type="button"
          variant="ghost"
        >
          清除选择
        </Button>
        <Button
          aria-describedby={
            desktopUnavailable ? 'inbox-desktop-requirement' : undefined
          }
          disabled={pending || !selectionIsValid || desktopUnavailable}
          onClick={() => void extract()}
          size="sm"
          title={desktopUnavailable ? detail : undefined}
          type="button"
        >
          <LockIcon aria-hidden data-icon="inline-start" />
          {pending ? '分析中…' : '冻结并分析'}
        </Button>
        {desktopUnavailable ? (
          <span className="sr-only" id="inbox-desktop-requirement">
            请在已绑定本地仓库的 Evidence Desktop 中运行 Inbox Analyst。
          </span>
        ) : null}
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
