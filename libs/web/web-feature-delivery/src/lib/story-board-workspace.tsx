import {
  useCallback,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  EvidencePositionIcon,
  EvidenceStatusBadge,
  FactRow,
  Inspector,
} from '@evidence/ui';
import { ArrowRightIcon, XIcon } from 'lucide-react';

import {
  DELIVERY_POSITIONS,
  groupStories,
  ownerEvidenceStatus,
  storyActionButtonLabel,
  storyAuthorityHref,
  storyAuthorityLabel,
  storyOwnerLabel,
  storyPositionTitle,
  type StoryState,
} from './story-board-model';

function StoryBoardWorkspace({
  stories,
  selectedStory,
  onSelectStory,
}: {
  stories: StoryState[];
  selectedStory: StoryState | null;
  onSelectStory: (story: StoryState | null) => void;
}) {
  return (
    <div
      className="grid h-full min-h-0 grid-cols-1 overflow-hidden data-[inspecting=true]:lg:grid-cols-[minmax(0,1fr)_22rem]"
      data-inspecting={Boolean(selectedStory)}
    >
      <StoryBoard
        onClearSelection={() => onSelectStory(null)}
        onInspect={onSelectStory}
        selectedStoryId={selectedStory?.data.id ?? null}
        stories={stories}
      />
      {selectedStory ? (
        <Inspector className="fixed inset-y-0 right-0 z-40 flex w-[min(24rem,100vw)] flex-col shadow-xl lg:static lg:w-auto lg:shadow-none">
          <StoryInspectorContent
            onClose={() => onSelectStory(null)}
            storyState={selectedStory}
          />
        </Inspector>
      ) : null}
    </div>
  );
}

function StoryBoard({
  stories,
  selectedStoryId,
  onInspect,
  onClearSelection,
}: {
  stories: StoryState[];
  selectedStoryId: string | null;
  onInspect: (story: StoryState) => void;
  onClearSelection: () => void;
}) {
  const grouped = useMemo(() => groupStories(stories), [stories]);
  const orderedStories = useMemo(
    () =>
      DELIVERY_POSITIONS.flatMap((position) => grouped.get(position.key) ?? []),
    [grouped],
  );
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const panState = useRef<{
    left: number;
    pointerX: number;
    pointerId: number;
  } | null>(null);

  const selectRelativeStory = useCallback(
    (offset: -1 | 1) => {
      if (orderedStories.length === 0) return;
      const currentIndex = orderedStories.findIndex(
        (story) => story.data.id === selectedStoryId,
      );
      const nextIndex =
        currentIndex < 0
          ? offset > 0
            ? 0
            : orderedStories.length - 1
          : Math.min(
              orderedStories.length - 1,
              Math.max(0, currentIndex + offset),
            );
      const nextStory = orderedStories[nextIndex];
      if (!nextStory) return;
      onInspect(nextStory);
      requestAnimationFrame(() =>
        cardRefs.current.get(nextStory.data.id)?.focus(),
      );
    },
    [onInspect, orderedStories, selectedStoryId],
  );

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, [role="menuitem"]')) return;
    panState.current = {
      left: event.currentTarget.scrollLeft,
      pointerX: event.clientX,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panState.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    event.currentTarget.scrollLeft = pan.left - (event.clientX - pan.pointerX);
  };

  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panState.current?.pointerId !== event.pointerId) return;
    panState.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      aria-label="交付知识位置"
      className="h-full min-w-0 touch-pan-y overflow-x-auto bg-background p-2 select-none active:cursor-grabbing"
      onKeyDown={(event) => {
        if (event.key === 'j' || event.key === 'ArrowDown') {
          event.preventDefault();
          selectRelativeStory(1);
        }
        if (event.key === 'k' || event.key === 'ArrowUp') {
          event.preventDefault();
          selectRelativeStory(-1);
        }
        if (event.key === 'Escape' && selectedStoryId) {
          event.preventDefault();
          onClearSelection();
        }
      }}
      onLostPointerCapture={endPan}
      onPointerCancel={endPan}
      onPointerDown={startPan}
      onPointerMove={movePan}
      onPointerUp={endPan}
      role="region"
      tabIndex={0}
    >
      <div className="flex h-full min-w-max gap-3">
        {DELIVERY_POSITIONS.map((position, index) => {
          const positionStories = grouped.get(position.key) ?? [];
          return (
            <section
              aria-labelledby={`delivery-position-${position.key}`}
              className="flex w-[17.5rem] shrink-0 flex-col overflow-hidden rounded-lg bg-muted/55 p-2"
              key={position.key}
            >
              <header className="flex h-9 shrink-0 items-center gap-2 px-1">
                <EvidencePositionIcon
                  className="size-3.5 shrink-0 text-muted-foreground"
                  position={position.key}
                />
                <h2
                  className="min-w-0 flex-1 truncate text-xs font-semibold"
                  id={`delivery-position-${position.key}`}
                  title={position.rule}
                >
                  {position.title}
                </h2>
                <span className="font-mono text-[0.6875rem] text-muted-foreground">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <Badge variant="outline">{positionStories.length}</Badge>
              </header>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-md p-1">
                {positionStories.length === 0 ? (
                  <p className="rounded-md border border-dashed px-3 py-6 text-center text-[0.6875rem] leading-4 text-muted-foreground">
                    {position.empty}
                  </p>
                ) : (
                  positionStories.map((storyState) => (
                    <StoryCard
                      key={storyState.data.id}
                      onInspect={onInspect}
                      ref={(node) => {
                        if (node)
                          cardRefs.current.set(storyState.data.id, node);
                        else cardRefs.current.delete(storyState.data.id);
                      }}
                      selected={storyState.data.id === selectedStoryId}
                      storyState={storyState}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function StoryCard({
  storyState,
  selected,
  onInspect,
  ref,
}: {
  storyState: StoryState;
  selected: boolean;
  onInspect: (story: StoryState) => void;
  ref: (node: HTMLButtonElement | null) => void;
}) {
  const story = storyState.data;
  const actionHref = storyAuthorityHref(storyState);

  return (
    <article
      className="group/story-card relative rounded-md border bg-card shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-colors hover:border-ev-line-strong hover:bg-secondary/35 data-[selected=true]:border-ring data-[selected=true]:ring-2 data-[selected=true]:ring-ring/20"
      data-selected={selected}
      data-story-card=""
    >
      <button
        aria-label={`快速查看 ${story.title}`}
        aria-pressed={selected}
        className="flex min-h-24 w-full flex-col gap-1.5 rounded-md p-2.5 pr-9 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        onClick={() => onInspect(storyState)}
        ref={ref}
        type="button"
      >
        <span className="flex w-full min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[0.6875rem] text-muted-foreground">
            {story.reference} · {story.iterationReference}
          </span>
          <EvidenceStatusBadge
            label={storyOwnerLabel(story.authority.owner)}
            status={ownerEvidenceStatus(story.authority.owner)}
          />
        </span>
        <span className="line-clamp-2 text-xs leading-4 font-semibold">
          {story.title}
        </span>
        <span className="line-clamp-1 text-[0.6875rem] leading-4 text-muted-foreground">
          {story.iterationStage} · {story.latestCitationCount} Evidence · v
          {story.latestRevisionNumber}
        </span>
        <span className="sr-only">当前位置 · {storyPositionTitle(story)}</span>
      </button>
      {actionHref ? (
        <Button
          aria-label={`打开 ${storyAuthorityLabel(story.authority.nextAction)}`}
          asChild
          className="absolute top-2 right-2 opacity-0 group-focus-within/story-card:opacity-100 group-hover/story-card:opacity-100"
          size="icon-xs"
          variant="ghost"
        >
          <Link to={actionHref}>
            <ArrowRightIcon aria-hidden />
          </Link>
        </Button>
      ) : null}
    </article>
  );
}

function StoryInspectorContent({
  storyState,
  onClose,
}: {
  storyState: StoryState;
  onClose: () => void;
}) {
  const story = storyState.data;
  const actionHref = storyAuthorityHref(storyState);
  const storyHref = storyState.getLink('self')?.href;

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <header className="flex shrink-0 items-start gap-2 border-b p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[0.6875rem] text-muted-foreground">
            {story.reference} · {story.iterationReference}
          </p>
          <h2 className="mt-0.5 line-clamp-2 text-sm font-semibold">
            {story.title}
          </h2>
        </div>
        <Button
          aria-label="关闭 Story Inspector"
          onClick={onClose}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <XIcon aria-hidden />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <Alert className="mb-4">
          <AlertTitle>知识位置由权威状态推导</AlertTitle>
          <AlertDescription>
            看板只投影 Server authority。直接操控不会跳过内部 Gate 或人工决定。
          </AlertDescription>
        </Alert>

        <InspectorSection title="当前权威">
          <FactRow>
            <span className="text-muted-foreground">位置</span>
            <code>{storyPositionTitle(story)}</code>
          </FactRow>
          <FactRow>
            <span className="text-muted-foreground">阶段</span>
            <code>
              {story.iterationLoop} / {story.iterationStage}
            </code>
          </FactRow>
          <FactRow>
            <span className="text-muted-foreground">责任方</span>
            <span>{storyOwnerLabel(story.authority.owner)}</span>
          </FactRow>
          <FactRow>
            <span className="text-muted-foreground">下一动作</span>
            <span className="max-w-48 text-right">
              {storyAuthorityLabel(story.authority.nextAction)}
            </span>
          </FactRow>
          <FactRow>
            <span className="text-muted-foreground">Story Revision</span>
            <code>
              v{story.latestRevisionNumber} · {story.latestScenarioCount} SC ·{' '}
              {story.latestCitationCount} Evidence
            </code>
          </FactRow>
        </InspectorSection>

        <InspectorSection title="固定边界">
          <InspectorBoundary label="Candidate selection">
            不创建 Story
          </InspectorBoundary>
          <InspectorBoundary label="Scenario authority">
            Understand 人工确认
          </InspectorBoundary>
          <InspectorBoundary label="Pair 入口">
            精确 Approved Plan
          </InspectorBoundary>
          <InspectorBoundary label="Pair 终点">
            本地批准；不自动 merge / push
          </InspectorBoundary>
          <InspectorBoundary label="Showcase authority">
            产品观察与价值决定只能由人提交
          </InspectorBoundary>
        </InspectorSection>
      </div>

      <footer className="flex shrink-0 justify-end gap-2 border-t p-3">
        {storyHref ? (
          <Button asChild size="sm" variant="outline">
            <Link to={storyHref}>打开 Story</Link>
          </Button>
        ) : null}
        {actionHref ? (
          <Button asChild size="sm">
            <Link to={actionHref}>{storyActionButtonLabel(story)}</Link>
          </Button>
        ) : null}
      </footer>
    </div>
  );
}

function InspectorSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-5 last:mb-0">
      <h3 className="mb-1 text-xs font-semibold">{title}</h3>
      <div className="border-y">{children}</div>
    </section>
  );
}

function InspectorBoundary({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <FactRow>
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-44 text-right text-xs">{children}</span>
    </FactRow>
  );
}

export { StoryBoardWorkspace };
