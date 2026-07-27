import { useMemo, type ReactNode } from 'react';
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
  Checkbox,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  FactRow,
  Inspector,
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
  pagination,
  total,
  onFocus,
  onSelectionChange,
}: {
  itemStates: State<InboxItemResource>[];
  focusedItem?: State<InboxItemResource>;
  selectedIds: ReadonlySet<string>;
  selectionLimitReached: boolean;
  pagination?: ReactNode;
  total: number;
  onFocus: (itemId: string) => void;
  onSelectionChange: (
    itemState: State<InboxItemResource>,
    selected: boolean,
  ) => void;
}) {
  return (
    <div className="grid h-full min-h-0 overflow-hidden xl:grid-cols-[20.625rem_minmax(0,1fr)_17rem]">
      <SourceList
        focusedItemId={focusedItem?.data.id}
        itemStates={itemStates}
        pagination={pagination}
        selectedIds={selectedIds}
        selectionLimitReached={selectionLimitReached}
        total={total}
        onFocus={onFocus}
        onSelectionChange={onSelectionChange}
      />
      {focusedItem ? (
        <SourceDetail key={focusedItem.data.id} itemState={focusedItem} />
      ) : (
        <EmptySourceDetail />
      )}
    </div>
  );
}

function SourceList({
  itemStates,
  focusedItemId,
  selectedIds,
  selectionLimitReached,
  pagination,
  total,
  onFocus,
  onSelectionChange,
}: {
  itemStates: State<InboxItemResource>[];
  focusedItemId?: string;
  selectedIds: ReadonlySet<string>;
  selectionLimitReached: boolean;
  pagination?: ReactNode;
  total: number;
  onFocus: (itemId: string) => void;
  onSelectionChange: (
    itemState: State<InboxItemResource>,
    selected: boolean,
  ) => void;
}) {
  return (
    <section
      aria-labelledby="inbox-source-list-title"
      className="flex min-h-[24rem] flex-col border-b bg-secondary xl:min-h-0 xl:border-r xl:border-b-0"
    >
      <header className="flex h-10 shrink-0 items-center justify-between border-b px-3">
        <h2 className="text-xs font-semibold" id="inbox-source-list-title">
          来源记录
        </h2>
        <span className="font-mono text-[0.6875rem] text-muted-foreground">
          {total} 条
        </span>
      </header>
      <div className="min-h-0 flex-1">
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
          <ScrollArea className="h-full max-h-[38rem] xl:max-h-none">
            <ol className="flex flex-col gap-1 p-1.5">
              {itemStates.map((itemState) => {
                const item = itemState.data;
                const selected = selectedIds.has(item.id);
                const selectable = item.status === 'active';
                return (
                  <li
                    className="flex items-start gap-2 rounded-md border border-transparent px-2.5 py-2.5 transition-colors data-[focused=true]:border-border data-[focused=true]:bg-card data-[selected=true]:border-primary/30 data-[selected=true]:bg-ev-brand-soft"
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
                        <span className="truncate text-xs font-semibold">
                          {item.title}
                        </span>
                        <SourceStatusBadge status={item.status} />
                      </span>
                      <span className="line-clamp-2 text-[0.6875rem] leading-4 text-muted-foreground">
                        {sourceKindLabel(item.sourceKind)} ·{' '}
                        {item.revisionCount} 个修订
                      </span>
                      <span className="flex flex-wrap items-center justify-between gap-2 font-mono text-[0.625rem] text-muted-foreground">
                        <span>{shortIdentifier(item.id)}</span>
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
      </div>
      {pagination ? (
        <footer className="shrink-0 border-t px-2 pb-2">{pagination}</footer>
      ) : null}
    </section>
  );
}

function SourceDetail({ itemState }: { itemState: State<InboxItemResource> }) {
  const revisionResource = useMemo(
    () => itemState.follow('latest-revision'),
    [itemState],
  );
  const revision = useResource<InboxRevisionResource>(revisionResource);
  const item = itemState.data;
  const selfHref = itemState.getLink('self')?.href;
  const revisionsHref = itemState.getLink('revisions')?.href;

  return (
    <>
      <article className="flex min-h-[32rem] min-w-0 flex-col bg-card xl:min-h-0">
        <header className="flex shrink-0 flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[0.6875rem] text-muted-foreground">
              {shortIdentifier(item.id)} · {sourceKindLabel(item.sourceKind)} ·
              修订 {item.revisionCount}
            </p>
            <h2 className="mt-1 truncate text-base font-semibold">
              {item.title}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              当前内容来自不可变 Revision；提取会冻结精确 latest Revision。
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
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
          </div>
        </header>
        <ScrollArea className="min-h-0 flex-1">
          {revision.error ? (
            <Alert className="m-4" variant="destructive">
              <AlertDescription>
                最新 Revision 加载失败：{revision.error.message}
              </AlertDescription>
            </Alert>
          ) : revision.loading || !revision.resourceState ? (
            <RevisionSkeleton />
          ) : (
            <SourceDocument revisionState={revision.resourceState} />
          )}
        </ScrollArea>
      </article>
      <Inspector className="min-h-[24rem] xl:min-h-0">
        <SourceFacts
          itemState={itemState}
          revisionState={revision.resourceState}
        />
      </Inspector>
    </>
  );
}

function SourceDocument({
  revisionState,
}: {
  revisionState: State<InboxRevisionResource>;
}) {
  const revision = revisionState.data;
  return (
    <div className="flex flex-col gap-5 p-5">
      <div>
        <p className="font-mono text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase">
          当前不可变快照 · {contentTypeLabel(revision.contentType)}
        </p>
        <h3 className="mt-2 text-xl font-semibold">{revision.title}</h3>
      </div>
      <Separator />
      {revision.body.trim() ? (
        revision.contentType === 'text/markdown' ? (
          <MessageResponse className="text-sm text-foreground [&>*+*]:mt-3 [&_a]:font-medium [&_a]:text-primary [&_blockquote]:border-l-2 [&_blockquote]:border-ev-brand [&_blockquote]:bg-ev-brand-soft [&_blockquote]:py-2 [&_blockquote]:pr-3 [&_blockquote]:pl-4 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0">
            {revision.body}
          </MessageResponse>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-6">
            {revision.body}
          </p>
        )
      ) : (
        <p className="text-sm text-muted-foreground">该 Revision 没有正文。</p>
      )}
    </div>
  );
}

function SourceFacts({
  itemState,
  revisionState,
}: {
  itemState: State<InboxItemResource>;
  revisionState?: State<InboxRevisionResource>;
}) {
  const item = itemState.data;
  const revision = revisionState?.data;
  const facts = [
    ['处理状态', statusLabel(item.status)],
    ['来源类型', sourceKindLabel(item.sourceKind)],
    ['内容类型', revision ? contentTypeLabel(revision.contentType) : '…'],
    ['最近更新', formatDateTime(item.updatedAt)],
    ['版本数量', String(item.revisionCount)],
  ];
  return (
    <div className="flex flex-col gap-4 p-3.5">
      <div>
        <h2 className="text-xs font-semibold">来源信息</h2>
        <p className="mt-1 text-[0.6875rem] text-muted-foreground">
          当前资源与不可变最新修订。
        </p>
      </div>
      <dl>
        {facts.map(([label, value]) => (
          <FactRow key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right">{value}</dd>
          </FactRow>
        ))}
      </dl>
      <div>
        <p className="text-[0.6875rem] font-medium text-muted-foreground">
          最新 SHA-256
        </p>
        <code className="mt-1 block break-all text-[0.625rem]">
          {item.latestRevisionSha256}
        </code>
      </div>
      {revision ? (
        <div className="rounded-md border bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="secondary">#{revision.revisionNumber}</Badge>
            <time
              className="font-mono text-[0.625rem] text-muted-foreground"
              dateTime={revision.capturedAt}
            >
              {formatDateTime(revision.capturedAt)}
            </time>
          </div>
          <p className="mt-2 text-xs font-medium">{revision.title}</p>
        </div>
      ) : null}
    </div>
  );
}

function EmptySourceDetail() {
  return (
    <div className="col-span-2 flex min-h-80 items-center justify-center bg-card">
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>选择一条来源查看详情</EmptyTitle>
          <EmptyDescription>
            只有 active 来源可以加入本轮 Extraction。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

function RevisionSkeleton() {
  return (
    <div aria-label="正在加载最新 Revision" className="flex flex-col gap-3 p-5">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-48 w-full" />
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
  return (
    { active: '活跃', deferred: '已暂缓', closed: '已关闭' }[status] ?? status
  );
}

function sourceKindLabel(sourceKind: string): string {
  return (
    {
      manual_text: '手工文本',
      local_markdown: '本地 Markdown',
      github_issue: 'GitHub Issue',
    }[sourceKind] ?? sourceKind
  );
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
