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
  Button,
  EvidencePage,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  PageActions,
  PageDescription,
  PageEyebrow,
  PageHeader,
  PageHeaderCopy,
  PageTitle,
  PageToolbar,
  ToggleGroup,
  ToggleGroupItem,
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

const statusOptions: Array<{ value: InboxStatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '活跃' },
  { value: 'deferred', label: '已暂缓' },
  { value: 'closed', label: '已关闭' },
];

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

  const capture = async (input: InboxSourceInput | InboxSourceInput[]) => {
    const sources = Array.isArray(input) ? input : [input];
    if (sources.length === 0) return;

    const collection = collectionState.follow('self');
    let firstCreatedId: string | null = null;
    try {
      for (const source of sources) {
        const created = (await collection.post({
          data: source,
        })) as State<InboxItemResource>;
        firstCreatedId ??= created.data.id;
      }
    } finally {
      const refreshed =
        (await collection.refresh()) as State<InboxItemCollectionResource>;
      setCollectionState(refreshed);
      setFocusedItemId(
        sources.length === 1
          ? firstCreatedId
          : (refreshed.collection[0]?.data.id ?? null),
      );
    }
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
    if (selfHref) navigate(collectionHref(selfHref, query, status));
  };

  const resetFilters = () => {
    if (!selfHref) return;
    setQuery('');
    setStatus('all');
    navigate(collectionHref(selfHref, '', 'all'));
  };

  return (
    <EvidencePage>
      <PageHeader>
        <PageHeaderCopy>
          <PageEyebrow>
            工作区来源 · {collectionState.data.page.totalElements} 条记录
          </PageEyebrow>
          <PageTitle>收件箱</PageTitle>
          <PageDescription>
            采集并核对来源身份，然后由人工选择 1–5
            个活跃条目。分析时会原子冻结各条目的精确最新修订，再由本地 Inbox
            Analyst 一次性提出候选。
          </PageDescription>
        </PageHeaderCopy>
        <PageActions>
          <InboxSourceDialog
            workspaceId={workspaceId(collectionState)}
            onCapture={capture}
          />
        </PageActions>
      </PageHeader>

      <PageToolbar>
        <form
          className="flex w-full min-w-0 items-center gap-2"
          onSubmit={applyFilters}
        >
          <FieldGroup className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center">
            <Field className="min-w-0 flex-1">
              <FieldLabel className="sr-only" htmlFor="inbox-search">
                搜索来源
              </FieldLabel>
              <Input
                id="inbox-search"
                placeholder="搜索标题、正文或来源类型…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </Field>
            <ToggleGroup
              aria-label="来源状态"
              onValueChange={(value) => {
                if (value) setStatus(value as InboxStatusFilter);
              }}
              size="sm"
              spacing={0}
              type="single"
              value={status}
              variant="outline"
            >
              {statusOptions.map((option) => (
                <ToggleGroupItem key={option.value} value={option.value}>
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Button
              disabled={!selfHref}
              size="sm"
              type="submit"
              variant="outline"
            >
              应用筛选
            </Button>
            <Button
              disabled={!selfHref || (!query && status === 'all')}
              onClick={resetFilters}
              size="sm"
              type="button"
              variant="ghost"
            >
              清除
            </Button>
          </FieldGroup>
        </form>
      </PageToolbar>

      {pageError ? (
        <Alert className="m-2" variant="destructive">
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="min-h-0 flex-1">
        <InboxSourceBrowser
          focusedItem={focusedItem}
          itemStates={collectionState.collection}
          pagination={
            <InboxPagination
              hasNext={Boolean(collectionState.getLink('next'))}
              hasPrevious={Boolean(collectionState.getLink('prev'))}
              label="收件箱分页"
              page={collectionState.data.page.number}
              pending={pagePending}
              totalPages={collectionState.data.page.totalPages}
              onNext={() => void navigatePage('next')}
              onPrevious={() => void navigatePage('prev')}
            />
          }
          selectedIds={selectedIds}
          selectionLimitReached={selectedItems.size >= maximumExtractionSources}
          total={collectionState.data.page.totalElements}
          onFocus={setFocusedItemId}
          onSelectionChange={toggleSelection}
        />
      </div>

      {selectedItems.size > 0 ? (
        <div className="shrink-0 border-t p-2">
          <InboxExtractionControls
            collectionState={collectionState}
            selectedSources={[...selectedItems.values()]}
            onClear={() => setSelectedItems(new Map())}
          />
        </div>
      ) : null}
    </EvidencePage>
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
