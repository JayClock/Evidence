import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useResource,
  type CodingRunCollectionResource,
  type CodingRunEvent,
  type CodingRunQualityCheck,
  type CodingRunResource,
  type LocalCodingReview,
  type State,
  type StoryResource,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@evidence/ui';

export function StoryCodingRunsPanel({
  storyState,
}: {
  storyState: State<StoryResource>;
}) {
  const collectionResource = useMemo(
    () => storyState.follow('coding-runs'),
    [storyState],
  );
  const runs = useResource<CodingRunCollectionResource>(collectionResource);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [review, setReview] = useState<LocalCodingReview | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const workspaceId = workspaceIdFromStory(storyState);
  const bridge = window.evidenceDesktop;

  const appendEvent = (text: string) => {
    setEvents((current) => [...current, text].slice(-100));
  };

  const handleEvent = (event: CodingRunEvent) => {
    if (event.event === 'message' && event.data.trim()) {
      appendEvent(event.data.trim());
      return;
    }
    const data = jsonRecord(event.data);
    if (event.event === 'run-started') {
      const run = recordOrNull(data?.run);
      if (typeof run?.id === 'string') setActiveRunId(run.id);
      appendEvent('Coding Run started in an isolated worktree.');
    } else if (event.event === 'tool-start') {
      appendEvent(`Agent tool: ${stringValue(data?.toolName, 'unknown')}`);
    } else if (event.event === 'quality-check') {
      appendEvent(
        `${stringValue(data?.name, 'Quality gate')}: ${stringValue(data?.status, 'unknown')}`,
      );
    } else if (event.event === 'review-ready') {
      const localReview = localReviewFromEvent(data);
      if (localReview) {
        setReview(localReview);
        const runId = stringValue(localReview.run.id, '');
        if (runId) setActiveRunId(runId);
      }
      appendEvent('The local diff is ready for human review.');
    } else if (event.event === 'controller-error' || event.event === 'error') {
      setError(event.data || 'Local coding failed.');
    } else if (event.event === 'cancelled') {
      appendEvent('Coding Run cancelled.');
    }
  };

  const start = async () => {
    if (!bridge?.runCodingAgent || !workspaceId || requestId) return;
    const id = requestIdentity();
    setRequestId(id);
    setActiveRunId(null);
    setReview(null);
    setEvents([]);
    setError(null);
    try {
      await bridge.runCodingAgent(
        {
          id,
          workspaceId,
          storyId: storyState.data.id,
          storyRevisionId: storyState.data.latestRevisionId,
        },
        handleEvent,
      );
    } catch (caught) {
      setError(errorMessage(caught, 'Local coding failed.'));
    } finally {
      setRequestId(null);
      await runs.resource.refresh().catch(() => undefined);
    }
  };

  const cancel = async () => {
    if (!requestId || !bridge?.cancelCodingAgent) return;
    await bridge.cancelCodingAgent(requestId);
  };

  const loadReview = async (runId: string) => {
    if (!bridge?.getCodingReview) return;
    setError(null);
    const loaded = await bridge.getCodingReview(runId);
    if (!loaded) {
      setError(
        'This review is not available in the current Desktop session. Start a new Coding Run if its local worktree was removed.',
      );
      return;
    }
    setActiveRunId(runId);
    setReview(loaded);
  };

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <CardTitle aria-level={2} role="heading">
            Coding Runs
          </CardTitle>
          <CardDescription>
            Pi edits only an isolated local Desktop worktree. Server stores
            bounded execution facts, never the full diff or repository path.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          {requestId ? (
            <Button onClick={() => void cancel()} variant="outline">
              Cancel
            </Button>
          ) : (
            <Button
              disabled={
                !bridge?.runCodingAgent ||
                !workspaceId ||
                storyState.data.latestScenarioCount === 0
              }
              onClick={() => void start()}
            >
              Start local coding
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!bridge?.runCodingAgent ? (
          <Alert>
            <AlertDescription>
              Coding Runs can only execute in the Desktop app.
            </AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {events.length > 0 ? (
          <div aria-live="polite" className="rounded-lg border bg-muted p-3">
            <p className="mb-2 text-sm font-medium">Local activity</p>
            <div className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs">
              {events.join('\n')}
            </div>
          </div>
        ) : null}
        {review && activeRunId && workspaceId ? (
          <LocalReviewPanel
            review={review}
            runId={activeRunId}
            workspaceId={workspaceId}
            onDecided={async () => {
              setReview(null);
              setActiveRunId(null);
              await runs.resource.refresh();
            }}
          />
        ) : null}
        <CodingRunCollectionContent
          loading={runs.loading}
          error={runs.error}
          resourceState={runs.resourceState}
          onLoadReview={loadReview}
        />
      </CardContent>
    </Card>
  );
}

export function CodingRunCollectionView({
  resourceState,
}: {
  resourceState: State<CodingRunCollectionResource>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle aria-level={1} role="heading">
          Coding Runs
        </CardTitle>
        <CardDescription>
          Server-side execution states locked to one Story Revision.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CodingRunTable resourceState={resourceState} />
      </CardContent>
    </Card>
  );
}

export function CodingRunDetailView({
  resourceState,
}: {
  resourceState: State<CodingRunResource>;
}) {
  const run = resourceState.data;
  const workspaceId = workspaceIdFromRun(resourceState);
  const [review, setReview] = useState<LocalCodingReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bridge = window.evidenceDesktop;

  const loadReview = async () => {
    if (!bridge?.getCodingReview) return;
    const loaded = await bridge.getCodingReview(run.id);
    if (!loaded) {
      setError('The full diff is not available in this Desktop session.');
      return;
    }
    setReview(loaded);
  };

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <Badge className="w-fit" variant={statusVariant(run.status)}>
            {formatStatus(run.status)}
          </Badge>
          <CardTitle aria-level={1} role="heading">
            Coding Run {run.id}
          </CardTitle>
          <CardDescription>
            Story Revision {run.storyRevisionId} · started{' '}
            {formatDateTime(run.startedAt)}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Fact label="Base commit" value={run.baseCommitSha} mono />
          <Fact label="Version" value={String(run.version)} />
          <Fact
            label="Changed files"
            value={
              run.changedFileCount === null
                ? 'Not available'
                : String(run.changedFileCount)
            }
          />
          <Fact
            label="Diff SHA-256"
            value={run.diffSha256 ?? 'Not available'}
            mono
          />
          <Fact label="Commit" value={run.commitSha ?? 'Not committed'} mono />
          <Fact
            label="Failure"
            value={run.failureSummary ?? run.failureCode ?? 'None'}
          />
        </CardContent>
      </Card>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {run.status === 'review_required' && !review ? (
        <Button
          className="w-fit"
          disabled={!bridge?.getCodingReview}
          onClick={() => void loadReview()}
        >
          Load local diff
        </Button>
      ) : null}
      {review && workspaceId ? (
        <LocalReviewPanel
          review={review}
          runId={run.id}
          workspaceId={workspaceId}
          onDecided={() => {
            setReview(null);
          }}
        />
      ) : null}
      <QualityChecks checks={run.qualityChecks} />
    </div>
  );
}

function CodingRunCollectionContent({
  loading,
  error,
  resourceState,
  onLoadReview,
}: {
  loading: boolean;
  error: Error | null;
  resourceState: State<CodingRunCollectionResource> | null;
  onLoadReview(runId: string): Promise<void>;
}) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }
  if (!resourceState) return null;
  return (
    <CodingRunTable resourceState={resourceState} onLoadReview={onLoadReview} />
  );
}

function CodingRunTable({
  resourceState,
  onLoadReview,
}: {
  resourceState: State<CodingRunCollectionResource>;
  onLoadReview?(runId: string): Promise<void>;
}) {
  if (resourceState.collection.length === 0) {
    return (
      <Empty className="py-8">
        <EmptyHeader>
          <EmptyTitle>No Coding Runs yet</EmptyTitle>
          <EmptyDescription>
            Start one from the latest Scenario-bearing Story Revision.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Changed files</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {resourceState.collection.map((runState) => {
            const run = runState.data;
            const href = runState.getLink('self')?.href;
            return (
              <TableRow key={run.id}>
                <TableCell>
                  <Badge variant={statusVariant(run.status)}>
                    {formatStatus(run.status)}
                  </Badge>
                </TableCell>
                <TableCell>{formatDateTime(run.startedAt)}</TableCell>
                <TableCell>{run.changedFileCount ?? '—'}</TableCell>
                <TableCell className="flex justify-end gap-2">
                  {run.status === 'review_required' && onLoadReview ? (
                    <Button
                      onClick={() => void onLoadReview(run.id)}
                      size="sm"
                      variant="outline"
                    >
                      Review local diff
                    </Button>
                  ) : null}
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
  );
}

function LocalReviewPanel({
  review,
  runId,
  workspaceId,
  onDecided,
}: {
  review: LocalCodingReview;
  runId: string;
  workspaceId: string;
  onDecided(): void | Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bridge = window.evidenceDesktop;

  const accept = async () => {
    if (!bridge?.acceptCodingRun || pending) return;
    setPending(true);
    setError(null);
    try {
      await bridge.acceptCodingRun({
        workspaceId,
        runId,
        diffSha256: review.diffSha256,
      });
      await onDecided();
    } catch (caught) {
      setError(errorMessage(caught, 'The Coding Run could not be accepted.'));
    } finally {
      setPending(false);
    }
  };

  const reject = async () => {
    if (!bridge?.rejectCodingRun || pending || !reason.trim()) return;
    setPending(true);
    setError(null);
    try {
      await bridge.rejectCodingRun({
        workspaceId,
        runId,
        diffSha256: review.diffSha256,
        reason: reason.trim(),
      });
      await onDecided();
    } catch (caught) {
      setError(errorMessage(caught, 'The Coding Run could not be rejected.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle aria-level={3} role="heading">
          Local diff review
        </CardTitle>
        <CardDescription>
          {review.changedFileCount} changed{' '}
          {review.changedFileCount === 1 ? 'file' : 'files'} ·{' '}
          {review.diffSha256}. Accepting creates a local commit only; it never
          merges or pushes.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <pre className="max-h-[32rem] overflow-auto rounded-lg border bg-muted p-3 text-xs">
          {review.diff}
        </pre>
        <Textarea
          aria-label="Rejection reason"
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason required only when rejecting"
          value={reason}
        />
        <div className="flex justify-end gap-2">
          <Button
            disabled={pending || !reason.trim()}
            onClick={() => void reject()}
            variant="outline"
          >
            Reject
          </Button>
          <Button disabled={pending} onClick={() => void accept()}>
            Accept and commit locally
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function QualityChecks({ checks }: { checks: CodingRunQualityCheck[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          Quality checks
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {checks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No checks recorded.</p>
        ) : (
          checks.map((check) => (
            <div
              className="flex items-start justify-between gap-4 rounded-lg border p-3"
              key={check.name}
            >
              <div>
                <p className="text-sm font-medium">{check.name}</p>
                {check.summary ? (
                  <p className="text-sm text-muted-foreground">
                    {check.summary}
                  </p>
                ) : null}
              </div>
              <Badge
                variant={
                  check.status === 'failed' ? 'destructive' : 'secondary'
                }
              >
                {check.status}
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function Fact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <p
        className={`mt-1 break-all text-sm text-muted-foreground ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value}
      </p>
    </div>
  );
}

function localReviewFromEvent(
  data: Record<string, unknown> | null,
): LocalCodingReview | null {
  if (!data) return null;
  const run = recordOrNull(data.run);
  if (
    !run ||
    typeof data.diff !== 'string' ||
    typeof data.diffSha256 !== 'string' ||
    typeof data.changedFileCount !== 'number'
  ) {
    return null;
  }
  return {
    run,
    diff: data.diff,
    diffSha256: data.diffSha256,
    changedFileCount: data.changedFileCount,
  };
}

function workspaceIdFromStory(state: State<StoryResource>): string | null {
  return workspaceIdFromHref(state.getLink('self')?.href);
}

function workspaceIdFromRun(state: State<CodingRunResource>): string | null {
  return workspaceIdFromHref(state.getLink('self')?.href);
}

function workspaceIdFromHref(href: string | undefined): string | null {
  const match = href?.match(/\/workspaces\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function jsonRecord(value: string): Record<string, unknown> | null {
  try {
    return recordOrNull(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function requestIdentity(): string {
  return `coding-${crypto.randomUUID()}`;
}

function statusVariant(
  status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'accepted') return 'default';
  if (status === 'failed' || status === 'rejected') return 'destructive';
  if (status === 'review_required') return 'outline';
  return 'secondary';
}

function formatStatus(value: string): string {
  return value
    .split('_')
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
