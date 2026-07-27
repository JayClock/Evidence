import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type {
  InboxItemCollectionResource,
  InboxItemResource,
  InboxSourceInput,
  State,
} from '@evidence/api-client';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@evidence/ui';
import { InboxSourceDialog } from './inbox-source-dialog';
import { InboxExtractionControls } from './inbox-extraction-controls';
import { InboxPagination } from './inbox-pagination';
import {
  InboxSourceBrowser,
  type InboxSourceSelection,
} from './inbox-source-browser';

const maximumExtractionSources = 5;

type InboxStatusFilter = 'all' | 'active' | 'deferred' | 'closed';

export function InboxCollectionView({
  resourceState,
}: {
  resourceState: State<InboxItemCollectionResource>;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const initialParameters = new URLSearchParams(location.search);
  const [collectionState, setCollectionState] = useState(resourceState);
  const [pagePending, setPagePending] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<
    Map<string, InboxSourceSelection>
  >(() => new Map());
  const [query, setQuery] = useState(initialParameters.get('q') ?? '');
  const [status, setStatus] = useState<InboxStatusFilter>(
    statusFilter(initialParameters.get('status')),
  );

  const focusedItem =
    collectionState.collection.find(
      (itemState) => itemState.data.id === focusedItemId,
    ) ?? collectionState.collection[0];
  const selectedIds = new Set(selectedItems.keys());
  const selfHref = collectionState.getLink('self')?.href;

  const toggleSelection = (
    itemState: State<InboxItemResource>,
    selected: boolean,
  ) => {
    setSelectedItems((current) => {
      const item = itemState.data;
      const next = new Map(current);
      if (!selected) {
        next.delete(item.id);
        return next;
      }
      if (
        item.status !== 'active' ||
        next.has(item.id) ||
        next.size >= maximumExtractionSources
      ) {
        return current;
      }
      next.set(item.id, {
        id: item.id,
        title: item.title,
        latestRevisionSha256: item.latestRevisionSha256,
      });
      return next;
    });
  };

  const capture = async (input: InboxSourceInput) => {
    const collection = collectionState.follow('self');
    const created = (await collection.post({
      data: input,
    })) as State<InboxItemResource>;
    const refreshed =
      (await collection.refresh()) as State<InboxItemCollectionResource>;
    setCollectionState(refreshed);
    setFocusedItemId(created.data.id);
  };

  const navigatePage = async (relation: 'prev' | 'next') => {
    if (!collectionState.getLink(relation) || pagePending) return;
    setPagePending(true);
    setPageError(null);
    try {
      const nextState = await collectionState.follow(relation).refresh();
      setCollectionState(nextState);
      setFocusedItemId(nextState.collection[0]?.data.id ?? null);
    } catch (caught) {
      setPageError(errorMessage(caught));
    } finally {
      setPagePending(false);
    }
  };

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selfHref) return;
    navigate(collectionHref(selfHref, query, status));
  };

  const resetFilters = () => {
    if (!selfHref) return;
    setQuery('');
    setStatus('all');
    navigate(collectionHref(selfHref, '', 'all'));
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-1 lg:overflow-hidden">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            工作区来源 · {collectionState.data.page.totalElements} 条记录
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">收件箱</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            采集并核对来源身份，然后由人工选择 1–5 个 active
            来源。分析时会原子冻结各来源的精确 latest Revision。
          </p>
        </div>
        <InboxSourceDialog
          workspaceId={workspaceId(collectionState)}
          onCapture={capture}
        />
      </header>

      <form
        className="rounded-xl bg-card p-3 ring-1 ring-foreground/10"
        onSubmit={applyFilters}
      >
        <FieldGroup className="grid gap-2 lg:grid-cols-[minmax(14rem,1fr)_12rem_auto_auto]">
          <Field>
            <FieldLabel className="sr-only" htmlFor="inbox-search">
              搜索来源
            </FieldLabel>
            <Input
              id="inbox-search"
              placeholder="搜索标题、正文或来源键…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel className="sr-only" htmlFor="inbox-status-filter">
              状态筛选
            </FieldLabel>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as InboxStatusFilter)}
            >
              <SelectTrigger id="inbox-status-filter" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="active">活跃</SelectItem>
                  <SelectItem value="deferred">已暂缓</SelectItem>
                  <SelectItem value="closed">已关闭</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Button disabled={!selfHref} type="submit" variant="outline">
            应用筛选
          </Button>
          <Button
            disabled={!selfHref || (!query && status === 'all')}
            type="button"
            variant="ghost"
            onClick={resetFilters}
          >
            清除
          </Button>
        </FieldGroup>
      </form>

      {pageError ? (
        <Alert variant="destructive">
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="min-h-0 flex-1 lg:[&>div]:h-full">
        <InboxSourceBrowser
          focusedItem={focusedItem}
          itemStates={collectionState.collection}
          selectedIds={selectedIds}
          selectionLimitReached={selectedItems.size >= maximumExtractionSources}
          onFocus={setFocusedItemId}
          onSelectionChange={toggleSelection}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            第 {collectionState.data.page.number} 页
          </Badge>
          <span className="text-xs text-muted-foreground">
            当前页 {collectionState.collection.length} 条
          </span>
        </div>
        <InboxPagination
          label="收件箱分页"
          page={collectionState.data.page.number}
          totalPages={collectionState.data.page.totalPages}
          hasPrevious={Boolean(collectionState.getLink('prev'))}
          hasNext={Boolean(collectionState.getLink('next'))}
          pending={pagePending}
          onPrevious={() => void navigatePage('prev')}
          onNext={() => void navigatePage('next')}
        />
      </div>

      {selectedItems.size > 0 ? (
        <InboxExtractionControls
          collectionState={collectionState}
          selectedSources={[...selectedItems.values()]}
          onClear={() => setSelectedItems(new Map())}
        />
      ) : null}
    </section>
  );
}

function collectionHref(
  selfHref: string,
  query: string,
  status: InboxStatusFilter,
): string {
  const url = new URL(
    selfHref,
    globalThis.location?.origin ?? 'http://localhost',
  );
  url.searchParams.set('page', '1');
  const normalizedQuery = query.trim();
  if (normalizedQuery) url.searchParams.set('q', normalizedQuery);
  else url.searchParams.delete('q');
  if (status === 'all') url.searchParams.delete('status');
  else url.searchParams.set('status', status);
  return `${url.pathname}${url.search}`;
}

function statusFilter(value: string | null): InboxStatusFilter {
  return value === 'active' || value === 'deferred' || value === 'closed'
    ? value
    : 'all';
}

function workspaceId(
  collectionState: State<InboxItemCollectionResource>,
): string | null {
  const href = collectionState.getLink('workspace')?.href;
  const match = href && /\/workspaces\/([^/?#]+)/.exec(href);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '来源操作失败，请重试。';
}
