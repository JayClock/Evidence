import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type {
  State,
  StoryCandidateCollectionResource,
  StoryCandidateDecisionInput,
  StoryCandidateResource,
  StoryCandidateStatus,
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldGroup,
  FieldLabel,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@evidence/ui';
import { DeliveryPagination } from './delivery-pagination';

export function StoryCandidateCollectionView({
  resourceState,
}: {
  resourceState: State<StoryCandidateCollectionResource>;
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
      setPageError(errorMessage(caught, 'The Candidate page could not load.'));
    } finally {
      setPagePending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="gap-2">
        <CardTitle aria-level={1} role="heading">
          Story Candidates
        </CardTitle>
        <CardDescription>
          Source-cited Inbox Analyst proposals have no Story identity or human
          authority. Select exactly one to admit a frozen Iteration.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Review immutable proposals before WIP admission.
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
              <EmptyTitle>No Story Candidates yet</EmptyTitle>
              <EmptyDescription>
                Select active Inbox sources and run the local Inbox Analyst.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Proposed</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {collectionState.collection.map((candidateState) => {
                  const candidate = candidateState.data;
                  const href = candidateState.getLink('self')?.href;
                  return (
                    <TableRow key={candidate.id}>
                      <TableCell className="min-w-56">
                        <p className="font-medium">{candidate.title}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {candidate.reference}
                        </p>
                      </TableCell>
                      <TableCell>{candidate.role}</TableCell>
                      <TableCell>
                        {formatLabel(candidate.cognitiveMode)}
                      </TableCell>
                      <TableCell>
                        <CandidateStatusBadge status={candidate.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(candidate.proposedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {href ? (
                          <Button asChild size="sm" variant="outline">
                            <Link to={href}>Review</Link>
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
          label="Story Candidate pages"
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

export function StoryCandidateDetailView({
  resourceState,
}: {
  resourceState: State<StoryCandidateResource>;
}) {
  const navigate = useNavigate();
  const [candidateState, setCandidateState] = useState(resourceState);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const candidate = candidateState.data;
  const bridge = window.evidenceDesktop;

  const decide = async (action: 'defer' | 'reject', reason: string) => {
    if (!candidateState.getLink(action) || pending) return;
    setPending(true);
    setError(null);
    try {
      const input: StoryCandidateDecisionInput = {
        candidateSha256: candidate.contentSha256,
        reason,
      };
      setCandidateState(
        (await candidateState.follow(action).post({
          data: input,
        })) as State<StoryCandidateResource>,
      );
    } catch (caught) {
      setError(
        errorMessage(caught, `The Candidate could not be ${action}red.`),
      );
      throw caught;
    } finally {
      setPending(false);
    }
  };

  const startIteration = async () => {
    if (!bridge?.startIteration || !candidateState.getLink('select') || pending)
      return;
    setPending(true);
    setError(null);
    try {
      await bridge.startIteration({
        id: requestId('iteration'),
        workspaceId: workspaceId(candidateState),
        candidateId: candidate.id,
      });
      const selected = (await candidateState
        .follow('self')
        .refresh()) as State<StoryCandidateResource>;
      setCandidateState(selected);
      const href = selected.getLink('iteration')?.href;
      if (!href)
        throw new Error('Selected Candidate is missing its Iteration link.');
      navigate(href);
    } catch (caught) {
      setError(errorMessage(caught, 'The Iteration could not be started.'));
    } finally {
      setPending(false);
    }
  };

  const iterationHref = candidateState.getLink('iteration')?.href;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle aria-level={1} role="heading">
                {candidate.title}
              </CardTitle>
              <CandidateStatusBadge status={candidate.status} />
            </div>
            <CardDescription>
              {candidate.reference} · Proposed by{' '}
              {formatLabel(candidate.proposedBy)}{' '}
              {formatDateTime(candidate.proposedAt)}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {candidateState.getLink('defer') ? (
              <CandidateDecisionDialog
                action="defer"
                disabled={pending}
                onDecide={decide}
              />
            ) : null}
            {candidateState.getLink('reject') ? (
              <CandidateDecisionDialog
                action="reject"
                disabled={pending}
                onDecide={decide}
              />
            ) : null}
            {candidateState.getLink('select') ? (
              <Button
                disabled={pending || !bridge?.startIteration}
                type="button"
                onClick={() => void startIteration()}
              >
                {pending ? 'Starting…' : 'Select and start Iteration'}
              </Button>
            ) : null}
            {iterationHref ? (
              <Button asChild>
                <Link to={iterationHref}>Open Iteration</Link>
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Alert>
            <AlertDescription>
              Selection freezes this exact Candidate and cited Revision
              snapshots. It does not create a Story; only a later human Kickoff
              confirmation can create US-001.
            </AlertDescription>
          </Alert>
          {!bridge?.startIteration && candidate.status === 'ready' ? (
            <Alert>
              <AlertDescription>
                Open Evidence Desktop and bind this Workspace to a local Git
                repository before selecting the Candidate.
              </AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <DetailItem label="Role" value={candidate.role} />
            <DetailItem
              label="Cognitive mode"
              value={formatLabel(candidate.cognitiveMode)}
            />
            <DetailItem label="Problem" value={candidate.problem} />
            <DetailItem label="Goal" value={candidate.goal} />
            <DetailItem label="Value" value={candidate.value} />
            <DetailItem
              label="Candidate SHA-256"
              value={candidate.contentSha256}
              mono
            />
          </div>
        </CardContent>
      </Card>
      <CitationCard citations={candidate.citations} />
    </div>
  );
}

function CandidateDecisionDialog({
  action,
  disabled,
  onDecide,
}: {
  action: 'defer' | 'reject';
  disabled: boolean;
  onDecide: (action: 'defer' | 'reject', reason: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reason.trim() || disabled) return;
    setError(null);
    try {
      await onDecide(action, reason.trim());
      setReason('');
      setOpen(false);
    } catch (caught) {
      setError(
        errorMessage(caught, `The Candidate could not be ${action}red.`),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled} type="button" variant="outline">
          {formatLabel(action)}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{formatLabel(action)} Candidate</DialogTitle>
          <DialogDescription>
            This terminal decision cannot be undone. Record why it is the right
            outcome.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${action}-reason`}>Reason</FieldLabel>
              <Textarea
                id={`${action}-reason`}
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </FieldGroup>
          <DialogFooter className="mt-5">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button disabled={!reason.trim() || disabled} type="submit">
              Record {action}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CitationCard({
  citations,
}: {
  citations: StoryCandidateResource['data']['citations'];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          Exact Inbox citations
        </CardTitle>
        <CardDescription>
          Candidate authority is bounded to these immutable Revision hashes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {citations.map((citation, index) => (
          <div key={`${citation.inboxRevisionId}:${citation.locator}`}>
            {index > 0 ? <Separator className="mb-3" /> : null}
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <DetailItem
                label="Inbox Item"
                value={citation.inboxItemId}
                mono
              />
              <DetailItem
                label="Revision"
                value={`v${String(citation.revisionNumber)} · ${citation.inboxRevisionId}`}
                mono
              />
              <DetailItem label="Locator" value={citation.locator} />
              <DetailItem
                label="Revision SHA-256"
                value={citation.revisionSha256}
                mono
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DetailItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={
          mono ? 'break-all font-mono text-xs' : 'whitespace-pre-wrap text-sm'
        }
      >
        {value}
      </p>
    </div>
  );
}

function CandidateStatusBadge({ status }: { status: StoryCandidateStatus }) {
  const variant =
    status === 'ready'
      ? 'default'
      : status === 'selected'
        ? 'secondary'
        : 'outline';
  return <Badge variant={variant}>{formatLabel(status)}</Badge>;
}

function workspaceId(state: State<StoryCandidateResource>): string {
  const href = state.getLink('workspace')?.href;
  const match = href && /\/workspaces\/([^/?#]+)/.exec(href);
  if (!match?.[1]) throw new Error('Candidate is missing its Workspace link.');
  return decodeURIComponent(match[1]);
}

function requestId(prefix: string): string {
  return `${prefix}:${globalThis.crypto?.randomUUID?.() ?? String(Date.now())}`;
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
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
