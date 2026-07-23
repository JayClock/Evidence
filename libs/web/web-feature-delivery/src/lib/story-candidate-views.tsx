import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type {
  InboxItemResource,
  State,
  StoryCandidateCollectionResource,
  StoryCandidateDecisionInput,
  StoryCandidateInput,
  StoryCandidateResource,
  StoryCandidateStatus,
  StoryCognitiveMode,
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
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
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

const cognitiveModes: StoryCognitiveMode[] = [
  'clear',
  'complicated',
  'complex',
];

export function CreateStoryCandidateDialog({
  inboxItemState,
}: {
  inboxItemState: State<InboxItemResource>;
}) {
  const navigate = useNavigate();
  const item = inboxItemState.data;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [problem, setProblem] = useState('');
  const [role, setRole] = useState('');
  const [goal, setGoal] = useState('');
  const [value, setValue] = useState('');
  const [cognitiveMode, setCognitiveMode] =
    useState<StoryCognitiveMode>('clear');
  const [locator, setLocator] = useState('whole-source');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle(item.title);
    setProblem('');
    setRole('');
    setGoal('');
    setValue('');
    setCognitiveMode('clear');
    setLocator('whole-source');
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      pending ||
      !formComplete({ title, problem, role, goal, value, locator })
    ) {
      return;
    }

    const input: StoryCandidateInput = {
      title: title.trim(),
      problem: problem.trim(),
      role: role.trim(),
      goal: goal.trim(),
      value: value.trim(),
      cognitiveMode,
      citations: [
        {
          inboxItemId: item.id,
          inboxRevisionId: item.latestRevisionId,
          contentSha256: item.latestRevisionSha256,
          locator: locator.trim(),
        },
      ],
    };

    setPending(true);
    setError(null);
    try {
      const created = await inboxItemState
        .follow('story-candidates')
        .post({ data: input });
      const href = created.getLink('self')?.href;
      reset();
      setOpen(false);
      if (href) {
        navigate(href);
      }
    } catch (caught) {
      setError(errorMessage(caught, 'The Story Candidate could not be saved.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) {
          if (nextOpen) {
            reset();
          }
          setOpen(nextOpen);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Propose Story</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Propose Story Candidate</DialogTitle>
          <DialogDescription>
            Create a non-authoritative proposal citing the current immutable
            Inbox Revision. A separate confirmation is required before it
            becomes Story Revision v1.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="candidate-title">Title</FieldLabel>
              <Input
                id="candidate-title"
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="candidate-role">Role</FieldLabel>
              <Input
                id="candidate-role"
                placeholder="Workspace maintainer"
                required
                value={role}
                onChange={(event) => setRole(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="candidate-problem">Problem</FieldLabel>
              <Textarea
                id="candidate-problem"
                className="min-h-24 resize-y"
                required
                value={problem}
                onChange={(event) => setProblem(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="candidate-goal">Goal</FieldLabel>
              <Textarea
                id="candidate-goal"
                className="min-h-20 resize-y"
                required
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="candidate-value">Value</FieldLabel>
              <Textarea
                id="candidate-value"
                className="min-h-20 resize-y"
                required
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="candidate-cognitive-mode">
                Cognitive mode
              </FieldLabel>
              <Select
                value={cognitiveMode}
                onValueChange={(mode) =>
                  setCognitiveMode(mode as StoryCognitiveMode)
                }
              >
                <SelectTrigger id="candidate-cognitive-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {cognitiveModes.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {formatLabel(mode)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                Clear is predictable, complicated needs expertise, and complex
                needs discovery.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="candidate-locator">
                Source locator
              </FieldLabel>
              <Input
                id="candidate-locator"
                required
                value={locator}
                onChange={(event) => setLocator(event.target.value)}
              />
              <FieldDescription>
                Name the cited heading, paragraph, line range, or whole source.
              </FieldDescription>
            </Field>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </FieldGroup>
          <DialogFooter className="mt-5">
            <DialogClose asChild>
              <Button disabled={pending} type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={
                pending ||
                !formComplete({ title, problem, role, goal, value, locator })
              }
              type="submit"
            >
              {pending ? 'Saving…' : 'Save Candidate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StoryCandidateCollectionView({
  resourceState,
}: {
  resourceState: State<StoryCandidateCollectionResource>;
}) {
  const [collectionState, setCollectionState] = useState(resourceState);
  const [pagePending, setPagePending] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const navigatePage = async (relation: 'prev' | 'next') => {
    if (!collectionState.getLink(relation) || pagePending) {
      return;
    }
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
          Proposals remain non-authoritative until a user explicitly confirms
          one as an immutable Story Revision.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Review source-cited delivery proposals.
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
                Open an Inbox item and propose a source-cited Story.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
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
                      <TableCell className="min-w-56 font-medium">
                        {candidate.title}
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
  const [decisionPending, setDecisionPending] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const candidate = candidateState.data;

  const decide = async (decision: 'confirm' | 'reject') => {
    if (candidate.status !== 'pending' || decisionPending) {
      return;
    }
    const input: StoryCandidateDecisionInput = {
      expectedVersion: candidate.version,
    };
    setDecisionPending(true);
    setDecisionError(null);
    try {
      const result = await candidateState
        .follow(decision)
        .post({ data: input });
      if (decision === 'confirm') {
        const href = result.getLink('self')?.href;
        if (href) navigate(href);
      } else {
        setCandidateState(result as State<StoryCandidateResource>);
      }
    } catch (caught) {
      setDecisionError(
        errorMessage(caught, `The Candidate could not be ${decision}ed.`),
      );
    } finally {
      setDecisionPending(false);
    }
  };

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
              Proposed {formatDateTime(candidate.proposedAt)} · Version{' '}
              {candidate.version}
            </CardDescription>
          </div>
          {candidate.status === 'pending' ? (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={decisionPending}
                type="button"
                variant="outline"
                onClick={() => void decide('reject')}
              >
                Reject
              </Button>
              <Button
                disabled={decisionPending}
                type="button"
                onClick={() => void decide('confirm')}
              >
                {decisionPending ? 'Recording…' : 'Confirm as Story v1'}
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Alert>
            <AlertDescription>
              A Candidate is only a proposal. Only the explicit confirmation
              action creates an authoritative, immutable Story Revision.
            </AlertDescription>
          </Alert>
          {decisionError ? (
            <Alert variant="destructive">
              <AlertDescription>{decisionError}</AlertDescription>
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
          {candidate.decidedAt ? (
            <p className="text-sm text-muted-foreground">
              Decision recorded {formatDateTime(candidate.decidedAt)}.
            </p>
          ) : null}
        </CardContent>
      </Card>
      <CitationCard citations={candidate.citations} />
    </div>
  );
}

function CitationCard({
  citations,
}: {
  citations: StoryCandidateResource['data']['citations'];
}) {
  return (
    <Card>
      <CardHeader className="gap-2">
        <CardTitle aria-level={2} role="heading">
          Source citations
        </CardTitle>
        <CardDescription>
          Exact immutable Inbox Revisions used by this proposal.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {citations.map((citation) => {
          const href = citation._links.revision?.href;
          return (
            <div
              className="flex flex-col gap-3 rounded-lg border p-4"
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
              <Separator />
              <p className="break-all font-mono text-xs text-muted-foreground">
                {citation.contentSha256}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function CandidateStatusBadge({ status }: { status: StoryCandidateStatus }) {
  const variant =
    status === 'confirmed'
      ? 'default'
      : status === 'pending'
        ? 'secondary'
        : 'outline';
  return <Badge variant={variant}>{formatLabel(status)}</Badge>;
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
    <div>
      <p className="text-sm font-medium">{label}</p>
      {mono ? (
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
          {value}
        </p>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
          {value}
        </p>
      )}
    </div>
  );
}

function formComplete(values: Record<string, string>): boolean {
  return Object.values(values).every((entry) => entry.trim().length > 0);
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
