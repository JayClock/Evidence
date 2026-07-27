import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  useResource,
  type InboxItemResource,
  type InboxRevisionResource,
  type State,
} from '@evidence/api-client';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  MessageResponse,
  ScrollArea,
  Separator,
  Skeleton,
} from '@evidence/ui';

export interface InboxSourceSelection {
  id: string;
  title: string;
  latestRevisionSha256: string;
}

export function InboxSourceBrowser({
  itemStates,
  focusedItem,
  selectedIds,
  selectionLimitReached,
  onFocus,
  onSelectionChange,
}: {
  itemStates: State<InboxItemResource>[];
  focusedItem?: State<InboxItemResource>;
  selectedIds: ReadonlySet<string>;
  selectionLimitReached: boolean;
  onFocus: (itemId: string) => void;
  onSelectionChange: (
    itemState: State<InboxItemResource>,
    selected: boolean,
  ) => void;
}) {
  return (
    <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(18rem,0.78fr)_minmax(0,1.72fr)]">
      <SourceList
        focusedItemId={focusedItem?.data.id}
        itemStates={itemStates}
        selectedIds={selectedIds}
        selectionLimitReached={selectionLimitReached}
        onFocus={onFocus}
        onSelectionChange={onSelectionChange}
      />
      {focusedItem ? (
        <SourceInspector key={focusedItem.data.id} itemState={focusedItem} />
      ) : (
        <EmptySourceInspector />
      )}
    </div>
  );
}

function SourceList({
  itemStates,
  focusedItemId,
  selectedIds,
  selectionLimitReached,
  onFocus,
  onSelectionChange,
}: {
  itemStates: State<InboxItemResource>[];
  focusedItemId?: string;
  selectedIds: ReadonlySet<string>;
  selectionLimitReached: boolean;
  onFocus: (itemId: string) => void;
  onSelectionChange: (
    itemState: State<InboxItemResource>,
    selected: boolean,
  ) => void;
}) {
  return (
    <Card className="min-h-[22rem] gap-0 py-0 lg:min-h-0">
      <CardHeader className="border-b py-4">
        <CardTitle>来源记录</CardTitle>
        <CardDescription>{itemStates.length} 条当前页记录</CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-0">
        {itemStates.length === 0 ? (
          <Empty className="h-full min-h-64 border-0">
            <EmptyHeader>
              <EmptyTitle>没有匹配的来源</EmptyTitle>
              <EmptyDescription>
                采集新来源，或调整搜索与状态筛选条件。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ScrollArea className="h-full max-h-[38rem] lg:max-h-none">
            <ol className="flex flex-col p-2">
              {itemStates.map((itemState) => {
                const item = itemState.data;
                const selected = selectedIds.has(item.id);
                const selectable = item.status === 'active';
                return (
                  <li
                    className="flex items-start gap-3 rounded-lg border border-transparent px-3 py-3 transition-colors data-[focused=true]:border-border data-[focused=true]:bg-muted/60 data-[selected=true]:border-primary/30 data-[selected=true]:bg-primary/5"
                    data-focused={focusedItemId === item.id}
                    data-selected={selected}
                    key={item.id}
                  >
                    <Checkbox
                      aria-label={`选择来源 ${item.title}`}
                      checked={selected}
                      disabled={
                        !selectable || (selectionLimitReached && !selected)
                      }
                      onCheckedChange={(checked) =>
                        onSelectionChange(itemState, checked === true)
                      }
                    />
                    <button
                      className="flex min-w-0 flex-1 flex-col gap-1 text-left outline-none focus-visible:rounded-md focus-visible:ring-3 focus-visible:ring-ring/50"
                      type="button"
                      onClick={() => onFocus(item.id)}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="truncate font-medium">
                          {item.title}
                        </span>
                        <SourceStatusBadge status={item.status} />
                      </span>
                      <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {sourceKindLabel(item.sourceKind)} · 修订{' '}
                        {item.revisionCount}
                      </span>
                      <span className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">
                          {shortIdentifier(item.id)}
                        </span>
                        <time dateTime={item.updatedAt}>
                          {formatDateTime(item.updatedAt)}
                        </time>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function SourceInspector({
  itemState,
}: {
  itemState: State<InboxItemResource>;
}) {
  const item = itemState.data;
  const selfHref = itemState.getLink('self')?.href;
  const revisionsHref = itemState.getLink('revisions')?.href;
  const latestRevisionHref = itemState.getLink('latest-revision')?.href;

  return (
    <Card className="min-h-[32rem] gap-0 py-0 lg:min-h-0">
      <CardHeader className="border-b py-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{shortIdentifier(item.id)}</Badge>
            <span className="text-xs text-muted-foreground">
              {sourceKindLabel(item.sourceKind)} · 修订 {item.revisionCount}
            </span>
          </div>
          <CardTitle aria-level={2} className="text-xl" role="heading">
            {item.title}
          </CardTitle>
          <CardDescription>
            当前内容来自不可变 Revision；加入提取时会冻结精确 latest Revision。
          </CardDescription>
        </div>
        <CardAction className="flex flex-wrap gap-2">
          {revisionsHref ? (
            <Button asChild size="sm" variant="outline">
              <Link to={revisionsHref}>修订历史</Link>
            </Button>
          ) : null}
          {selfHref ? (
            <Button asChild size="sm">
              <Link to={selfHref}>打开来源</Link>
            </Button>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-0">
        <ScrollArea className="h-full max-h-[46rem] lg:max-h-none">
          <div className="flex flex-col gap-5 p-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Fact label="状态" value={statusLabel(item.status)} />
              <Fact label="来源类型" value={sourceKindLabel(item.sourceKind)} />
              <Fact label="修订数量" value={String(item.revisionCount)} />
              <Fact label="最近更新" value={formatDateTime(item.updatedAt)} />
              <Fact
                className="sm:col-span-2 xl:col-span-4"
                label="Latest Revision SHA-256"
                mono
                value={item.latestRevisionSha256}
              />
            </div>
            <Separator />
            {latestRevisionHref ? (
              <LatestRevision itemState={itemState} />
            ) : (
              <Alert>
                <AlertDescription>
                  当前资源没有提供 latest-revision
                  relation。请打开来源查看完整内容。
                </AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function LatestRevision({
  itemState,
}: {
  itemState: State<InboxItemResource>;
}) {
  const revisionResource = useMemo(
    () => itemState.follow('latest-revision'),
    [itemState],
  );
  const revision = useResource<InboxRevisionResource>(revisionResource);

  if (revision.loading) {
    return <RevisionSkeleton />;
  }

  if (revision.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          最新 Revision 加载失败：{revision.error.message}
        </AlertDescription>
      </Alert>
    );
  }

  if (!revision.resourceState) {
    return <RevisionSkeleton />;
  }

  return <LatestRevisionContent revisionState={revision.resourceState} />;
}

function LatestRevisionContent({
  revisionState,
}: {
  revisionState: State<InboxRevisionResource>;
}) {
  const revision = revisionState.data;
  const providerMetadata = readableMetadata(revision.providerMetadata);

  return (
    <section
      aria-labelledby="latest-revision-heading"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            当前内容 · Revision {revision.revisionNumber}
          </p>
          <h3 className="mt-1 text-lg font-medium" id="latest-revision-heading">
            {revision.title}
          </h3>
        </div>
        <Badge variant="secondary">
          {contentTypeLabel(revision.contentType)}
        </Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Fact label="采集时间" value={formatDateTime(revision.capturedAt)} />
        <Fact
          label="来源更新时间"
          value={
            revision.sourceUpdatedAt
              ? formatDateTime(revision.sourceUpdatedAt)
              : '未提供'
          }
        />
        {revision.uri ? (
          <Fact
            className="sm:col-span-2"
            label="来源 URI"
            mono
            value={revision.uri}
          />
        ) : null}
        {providerMetadata ? (
          <Fact
            className="sm:col-span-2"
            label="来源元数据"
            mono
            value={providerMetadata}
          />
        ) : null}
      </div>
      <Separator />
      <div>
        <p className="mb-3 text-sm font-medium">来源正文</p>
        {revision.body.trim() ? (
          revision.contentType === 'text/markdown' ? (
            <MessageResponse className="text-sm text-foreground [&>*+*]:mt-3 [&_a]:font-medium [&_a]:text-primary [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0">
              {revision.body}
            </MessageResponse>
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {revision.body}
            </p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            该 Revision 没有正文。
          </p>
        )}
      </div>
    </section>
  );
}

function EmptySourceInspector() {
  return (
    <Card className="min-h-80">
      <Empty className="h-full border-0">
        <EmptyHeader>
          <EmptyTitle>选择一条来源查看详情</EmptyTitle>
          <EmptyDescription>
            只有 active 来源可以加入本轮 Extraction。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </Card>
  );
}

function RevisionSkeleton() {
  return (
    <div aria-label="正在加载最新 Revision" className="flex flex-col gap-3">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function Fact({
  label,
  value,
  mono = false,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className="mt-1 break-words text-sm data-[mono=true]:break-all data-[mono=true]:font-mono data-[mono=true]:text-xs"
        data-mono={mono}
      >
        {value}
      </p>
    </div>
  );
}

function SourceStatusBadge({ status }: { status: string }) {
  const variant =
    status === 'active'
      ? 'default'
      : status === 'deferred'
        ? 'secondary'
        : 'outline';
  return <Badge variant={variant}>{statusLabel(status)}</Badge>;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'active':
      return '活跃';
    case 'deferred':
      return '已暂缓';
    case 'closed':
      return '已关闭';
    default:
      return status;
  }
}

function sourceKindLabel(sourceKind: string): string {
  switch (sourceKind) {
    case 'manual_text':
      return '手工文本';
    case 'local_markdown':
      return '本地 Markdown';
    case 'github_issue':
      return 'GitHub Issue';
    default:
      return sourceKind;
  }
}

function contentTypeLabel(contentType: string): string {
  return contentType === 'text/markdown' ? 'Markdown' : '纯文本';
}

function shortIdentifier(value: string): string {
  return value.length > 16 ? `${value.slice(0, 12)}…` : value;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function readableMetadata(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && Object.keys(value).length === 0) return null;
  return JSON.stringify(value);
}
