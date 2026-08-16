import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import type { State, StoryCollectionResource } from '@evidence/api-client';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  EvidenceCanvas,
  EvidenceStatusBadge,
  Input,
  PageDescription,
  PageEyebrow,
  PageHeader,
  PageHeaderCopy,
  PageTitle,
  PageToolbar,
  ToggleGroup,
  ToggleGroupItem,
} from '@evidence/ui';

import { DeliveryPagination } from './delivery-pagination';
import {
  FILTER_LABELS,
  SCOPE_LABELS,
  parseFilter,
  parseScope,
  scopeMatches,
  storyMatches,
  type StoryState,
} from './story-board-model';
import { StoryBoardWorkspace } from './story-board-workspace';

export { storyAuthorityHref, storyAuthorityLabel } from './story-board-model';

export function StoryCollectionView({
  resourceState,
}: {
  resourceState: State<StoryCollectionResource>;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [collectionState, setCollectionState] = useState(resourceState);
  const [selectedStory, setSelectedStory] = useState<StoryState | null>(null);
  const [pagePending, setPagePending] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const query = searchParams.get('q') ?? '';
  const filter = parseFilter(searchParams.get('filter'));
  const scope = parseScope(searchParams.get('scope'));
  const deferredQuery = useDeferredValue(query);
  const focusedIterationReference =
    collectionState.collection.find(
      (storyState) => storyState.data.iterationLifecycle === 'active',
    )?.data.iterationReference ??
    collectionState.collection[0]?.data.iterationReference;
  const stories = useMemo(
    () =>
      collectionState.collection.filter(
        (storyState) =>
          scopeMatches(storyState.data, scope, focusedIterationReference) &&
          storyMatches(storyState.data, deferredQuery, filter),
      ),
    [
      collectionState.collection,
      deferredQuery,
      filter,
      focusedIterationReference,
      scope,
    ],
  );

  useEffect(() => {
    if (
      selectedStory &&
      !stories.some((story) => story.data.id === selectedStory.data.id)
    ) {
      setSelectedStory(null);
    }
  }, [selectedStory, stories]);

  const setViewParameter = useCallback(
    (key: 'filter' | 'q' | 'scope', value: string, defaultValue = '') => {
      const next = new URLSearchParams(searchParams);
      if (!value || value === defaultValue) next.delete(key);
      else next.set(key, value);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const navigatePage = async (relation: 'prev' | 'next') => {
    if (!collectionState.getLink(relation) || pagePending) return;
    setPagePending(true);
    setPageError(null);
    try {
      setCollectionState(await collectionState.follow(relation).refresh());
      setSelectedStory(null);
    } catch (caught) {
      setPageError(errorMessage(caught, '无法载入 Story 页面。'));
    } finally {
      setPagePending(false);
    }
  };

  return (
    <EvidenceCanvas className="overflow-hidden">
      <PageHeader>
        <PageHeaderCopy>
          <PageEyebrow>
            权威交付 · {collectionState.data.page.totalElements} 个已确认 Story
          </PageEyebrow>
          <PageTitle>交付知识位置</PageTitle>
          <PageDescription>
            六个位置投影同一套 Server authority；内部 Gate 不成为独立列。
          </PageDescription>
        </PageHeaderCopy>
      </PageHeader>

      <PageToolbar className="flex-wrap">
        <ToggleGroup
          aria-label="范围视角"
          className="max-w-full flex-wrap justify-start"
          onValueChange={(value) => {
            if (value) setViewParameter('scope', value, 'overall');
          }}
          size="sm"
          spacing={0}
          type="single"
          value={scope}
          variant="outline"
        >
          {SCOPE_LABELS.map((item) => (
            <ToggleGroupItem key={item.value} value={item.value}>
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="min-w-0 flex-1" />
        <label className="w-56 shrink-0">
          <span className="sr-only">搜索 Story</span>
          <Input
            className="h-7"
            onChange={(event) => setViewParameter('q', event.target.value)}
            placeholder="搜索 Story 或 Iteration…"
            type="search"
            value={query}
          />
        </label>
        <ToggleGroup
          aria-label="权威状态筛选"
          onValueChange={(value) => {
            if (value) setViewParameter('filter', value, 'all');
          }}
          size="sm"
          spacing={0}
          type="single"
          value={filter}
          variant="outline"
        >
          {FILTER_LABELS.map((item) => (
            <ToggleGroupItem key={item.value} value={item.value}>
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <EvidenceStatusBadge label="Server authority" status="locked" />
      </PageToolbar>

      {pageError ? (
        <Alert className="m-2" variant="destructive">
          <AlertTitle>分页载入失败</AlertTitle>
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden">
        {collectionState.collection.length === 0 ? (
          <StoryEmptyState
            description="人工 confirm 一份 Frozen Kickoff Proposal 后才会创建 US-001。"
            title="尚无权威 Story"
          />
        ) : stories.length === 0 ? (
          <StoryEmptyState
            description="清除搜索条件或切换筛选，查看当前分页的其他 Story。"
            title="没有匹配的 Story"
          />
        ) : (
          <StoryBoardWorkspace
            onSelectStory={setSelectedStory}
            selectedStory={selectedStory}
            stories={stories}
          />
        )}
      </div>

      {collectionState.data.page.totalPages > 1 ? (
        <div className="shrink-0 border-t px-3 pb-2">
          <DeliveryPagination
            hasNext={Boolean(collectionState.getLink('next'))}
            hasPrevious={Boolean(collectionState.getLink('prev'))}
            label="Story 分页"
            page={collectionState.data.page.number}
            pending={pagePending}
            totalPages={collectionState.data.page.totalPages}
            onNext={() => void navigatePage('next')}
            onPrevious={() => void navigatePage('prev')}
          />
        </div>
      ) : null}
    </EvidenceCanvas>
  );
}

function StoryEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Empty className="h-full border-0">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
