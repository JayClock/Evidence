import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  useResource,
  type State,
  type StoryCollectionResource,
  type StoryResource,
  type StoryRevisionCollectionResource,
  type StoryRevisionResource,
} from '@evidence/api-client';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@evidence/ui';
import { DeliveryPagination } from './delivery-pagination';
import { StoryCodingRunsPanel } from './coding-run-views';
import { CreateStoryRevisionDialog } from './story-revision-dialog';

export function StoryCollectionView({
  resourceState,
}: {
  resourceState: State<StoryCollectionResource>;
}) {
  const [collectionState, setCollectionState] = useState(resourceState);
  const [pagePending, setPagePending] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const navigatePage = async (relation: 'prev' | 'next') => {
    if (!collectionState.getLink(relation) || pagePending) return;
    setPagePending(true);
    setPageError(null);
    try {
      setCollectionState(await collectionState.follow(relation).refresh());
    } catch (caught) {
      setPageError(errorMessage(caught, 'The Story page could not load.'));
    } finally {
      setPagePending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="gap-2">
        <CardTitle aria-level={1} role="heading">
          Stories
        </CardTitle>
        <CardDescription>
          Human-confirmed Story identities and their immutable revision
          histories.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Coding runs must lock one exact Story Revision.
          </p>
          <Badge variant="secondary">
            {collectionState.data.page.totalElements} total
          </Badge>
        </div>
        {pageError ? (
          <Alert className="mb-3" variant="destructive">
            <AlertDescription>{pageError}</AlertDescription>
          </Alert>
        ) : null}
        {collectionState.collection.length === 0 ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyTitle>No confirmed Stories yet</EmptyTitle>
              <EmptyDescription>
                Confirm a pending Story Candidate to create Revision v1.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Latest revision</TableHead>
                  <TableHead>Revision count</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {collectionState.collection.map((storyState) => {
                  const story = storyState.data;
                  const href = storyState.getLink('self')?.href;
                  return (
                    <TableRow key={story.id}>
                      <TableCell className="min-w-56 font-medium">
                        {story.title}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        v{story.latestRevisionNumber}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {story.revisionCount}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(story.updatedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {href ? (
                          <Button asChild size="sm" variant="outline">
                            <Link to={href}>Open</Link>
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <DeliveryPagination
          label="Story pages"
          page={collectionState.data.page.number}
          totalPages={collectionState.data.page.totalPages}
          hasPrevious={Boolean(collectionState.getLink('prev'))}
          hasNext={Boolean(collectionState.getLink('next'))}
          pending={pagePending}
          onPrevious={() => void navigatePage('prev')}
          onNext={() => void navigatePage('next')}
        />
      </CardContent>
    </Card>
  );
}

export function StoryDetailView({
  resourceState,
}: {
  resourceState: State<StoryResource>;
}) {
  const latestResource = useMemo(
    () => resourceState.follow('latest-revision'),
    [resourceState],
  );
  const latest = useResource<StoryRevisionResource>(latestResource);
  const story = resourceState.data;
  const revisionsHref = resourceState.getLink('revisions')?.href;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <CardTitle aria-level={1} role="heading">
              {story.title}
            </CardTitle>
            <CardDescription>
              Story · latest revision v{story.latestRevisionNumber} ·{' '}
              {story.revisionCount}{' '}
              {story.revisionCount === 1 ? 'revision' : 'revisions'}
            </CardDescription>
            <Badge className="w-fit" variant="secondary">
              {story.latestScenarioCount > 0
                ? `${String(story.latestScenarioCount)} acceptance ${story.latestScenarioCount === 1 ? 'scenario' : 'scenarios'}`
                : 'Needs acceptance scenarios'}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {latest.resourceState &&
            resourceState.getLink('create-revision') ? (
              <CreateStoryRevisionDialog
                storyState={resourceState}
                latestRevisionState={latest.resourceState}
              />
            ) : null}
            {revisionsHref ? (
              <Button asChild variant="outline">
                <Link to={revisionsHref}>Revision history</Link>
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailItem
              label="Created"
              value={formatDateTime(story.createdAt)}
            />
            <DetailItem
              label="Updated"
              value={formatDateTime(story.updatedAt)}
            />
          </div>
        </CardContent>
      </Card>
      {resourceState.getLink('coding-runs') ? (
        <StoryCodingRunsPanel storyState={resourceState} />
      ) : null}
      <RelatedCard
        title={`Latest revision · v${String(story.latestRevisionNumber)}`}
        description="The current immutable Story snapshot."
        loading={latest.loading}
        error={latest.error}
      >
        {latest.resourceState ? (
          <StoryRevisionContent resourceState={latest.resourceState} />
        ) : null}
      </RelatedCard>
    </div>
  );
}

export function StoryRevisionCollectionView({
  resourceState,
}: {
  resourceState: State<StoryRevisionCollectionResource>;
}) {
  const [pageState, setPageState] = useState(resourceState);
  const [pagePending, setPagePending] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const navigatePage = async (relation: 'prev' | 'next') => {
    if (!pageState.getLink(relation) || pagePending) return;
    setPagePending(true);
    setPageError(null);
    try {
      setPageState(await pageState.follow(relation).refresh());
    } catch (caught) {
      setPageError(errorMessage(caught, 'The revision page could not load.'));
    } finally {
      setPagePending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="gap-2">
        <CardTitle aria-level={1} role="heading">
          Story revision history
        </CardTitle>
        <CardDescription>
          Every immutable snapshot retained for reproducible delivery work.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pageError ? (
          <Alert className="mb-3" variant="destructive">
            <AlertDescription>{pageError}</AlertDescription>
          </Alert>
        ) : null}
        {pageState.collection.length === 0 ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyTitle>No Story Revisions found</EmptyTitle>
              <EmptyDescription>
                A confirmed Story always begins with Revision v1.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Revision</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Content hash</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageState.collection.map((revisionState) => {
                  const revision = revisionState.data;
                  const href = revisionState.getLink('self')?.href;
                  return (
                    <TableRow key={revision.id}>
                      <TableCell className="font-medium tabular-nums">
                        v{revision.revisionNumber}
                      </TableCell>
                      <TableCell className="min-w-56">
                        {revision.title}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(revision.createdAt)}
                      </TableCell>
                      <TableCell className="max-w-48 truncate font-mono text-xs">
                        {revision.contentSha256}
                      </TableCell>
                      <TableCell className="text-right">
                        {href ? (
                          <Button asChild size="sm" variant="outline">
                            <Link to={href}>Open</Link>
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <DeliveryPagination
          label="Story Revision pages"
          page={pageState.data.page.number}
          totalPages={pageState.data.page.totalPages}
          hasPrevious={Boolean(pageState.getLink('prev'))}
          hasNext={Boolean(pageState.getLink('next'))}
          pending={pagePending}
          onPrevious={() => void navigatePage('prev')}
          onNext={() => void navigatePage('next')}
        />
      </CardContent>
    </Card>
  );
}

export function StoryRevisionDetailView({
  resourceState,
}: {
  resourceState: State<StoryRevisionResource>;
}) {
  return (
    <Card>
      <CardHeader className="gap-2">
        <Badge className="w-fit" variant="secondary">
          Revision v{resourceState.data.revisionNumber}
        </Badge>
        <CardTitle aria-level={1} role="heading">
          {resourceState.data.title}
        </CardTitle>
        <CardDescription>
          Immutable Story snapshot created{' '}
          {formatDateTime(resourceState.data.createdAt)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <StoryRevisionContent resourceState={resourceState} />
      </CardContent>
    </Card>
  );
}

function StoryRevisionContent({
  resourceState,
}: {
  resourceState: State<StoryRevisionResource>;
}) {
  const revision = resourceState.data;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <DetailItem label="Role" value={revision.role} />
        <DetailItem
          label="Cognitive mode"
          value={formatLabel(revision.cognitiveMode)}
        />
        <DetailItem
          label="Problem"
          value={revision.problem}
          variant="multiline"
        />
        <DetailItem label="Goal" value={revision.goal} variant="multiline" />
        <DetailItem label="Value" value={revision.value} variant="multiline" />
        <DetailItem
          label="Story Revision SHA-256"
          value={revision.contentSha256}
          variant="mono"
        />
      </div>
      <Separator />
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium">Acceptance scenarios</p>
          <p className="text-sm text-muted-foreground">
            Ordered Given/When/Then outcomes frozen into this Revision.
          </p>
        </div>
        {revision.scenarios.length === 0 ? (
          <Alert>
            <AlertDescription>
              This Revision predates acceptance Scenario confirmation.
            </AlertDescription>
          </Alert>
        ) : (
          revision.scenarios.map((scenario, index) => (
            <Card key={scenario.id} size="sm">
              <CardHeader>
                <Badge className="w-fit" variant="outline">
                  Scenario {index + 1}
                </Badge>
                <CardTitle aria-level={3} role="heading">
                  {scenario.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <ScenarioPhase label="Given" steps={scenario.given} />
                <ScenarioPhase label="When" steps={[scenario.when]} />
                <ScenarioPhase label="Then" steps={scenario.then} />
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <Separator />
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium">Source citations</p>
          <p className="text-sm text-muted-foreground">
            Exact Inbox Revisions frozen into this Story Revision.
          </p>
        </div>
        {revision.citations.map((citation) => {
          const href = citation._links.revision?.href;
          return (
            <div
              className="flex flex-col gap-2 rounded-lg border p-4"
              key={`${citation.inboxRevisionId}:${citation.locator}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    Inbox Revision #{citation.inboxRevisionNumber}
                  </Badge>
                  <Badge variant="outline">{citation.locator}</Badge>
                </div>
                {href ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to={href}>Open source</Link>
                  </Button>
                ) : null}
              </div>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {citation.contentSha256}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScenarioPhase({
  label,
  steps,
}: {
  label: 'Given' | 'When' | 'Then';
  steps: string[];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[5rem_1fr]">
      <Badge className="h-fit w-fit" variant="secondary">
        {label.toUpperCase()}
      </Badge>
      <div className="flex flex-col gap-2">
        {steps.map((step, index) => (
          <p className="whitespace-pre-wrap text-sm" key={`${label}-${index}`}>
            {index > 0 ? 'AND ' : ''}
            {step}
          </p>
        ))}
      </div>
    </div>
  );
}

function RelatedCard({
  title,
  description,
  loading,
  error,
  children,
}: {
  title: string;
  description: string;
  loading: boolean;
  error: Error | null;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="gap-2">
        <CardTitle aria-level={2} role="heading">
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function DetailItem({
  label,
  value,
  variant = 'plain',
}: {
  label: string;
  value: string;
  variant?: 'plain' | 'mono' | 'multiline';
}) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      {variant === 'mono' ? (
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
          {value}
        </p>
      ) : variant === 'multiline' ? (
        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
          {value}
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{value}</p>
      )}
    </div>
  );
}

function formatLabel(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
