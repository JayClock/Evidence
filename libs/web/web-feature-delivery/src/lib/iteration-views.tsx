import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type {
  IterationIntakeResource,
  IterationResource,
  KickoffDecisionAction,
  KickoffDecisionInput,
  KickoffDecisionResultResource,
  KickoffResource,
  State,
  StoryCardResource,
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
  Field,
  FieldGroup,
  FieldLabel,
  Separator,
  Textarea,
} from '@evidence/ui';

export function IterationDetailView({
  resourceState,
}: {
  resourceState: State<IterationResource>;
}) {
  const iteration = resourceState.data;
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle aria-level={1} role="heading">
              {iteration.reference}
            </CardTitle>
            <Badge>{formatLabel(iteration.lifecycle)}</Badge>
            <Badge variant="outline">
              {formatLabel(iteration.loop)} / {formatLabel(iteration.stage)}
            </Badge>
          </div>
          <CardDescription>
            One frozen Candidate, one isolated branch, and at most one Story.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {resourceState.getLink('intake') ? (
            <Button asChild variant="outline">
              <Link to={resourceState.getLink('intake')?.href ?? '#'}>
                Frozen Intake
              </Link>
            </Button>
          ) : null}
          {resourceState.getLink('kickoff') ? (
            <Button asChild>
              <Link to={resourceState.getLink('kickoff')?.href ?? '#'}>
                Open Kickoff
              </Link>
            </Button>
          ) : null}
          {resourceState.getLink('understanding') ? (
            <Button asChild>
              <Link to={resourceState.getLink('understanding')?.href ?? '#'}>
                Open Understand / TQA
              </Link>
            </Button>
          ) : null}
          {resourceState.getLink('tasking') ? (
            <Button asChild>
              <Link to={resourceState.getLink('tasking')?.href ?? '#'}>
                Open Tasking / Desk Check
              </Link>
            </Button>
          ) : null}
          {resourceState.getLink('story') ? (
            <Button asChild variant="outline">
              <Link to={resourceState.getLink('story')?.href ?? '#'}>
                Open US-001
              </Link>
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {iteration.lifecycle === 'provisioning_failed' ? (
          <Alert variant="destructive">
            <AlertDescription>
              {iteration.provisioningFailureSummary ??
                'Desktop provisioning failed. This Candidate remains selected for explicit recovery.'}
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <Detail label="Base commit" value={iteration.baseCommitSha} mono />
          <Detail
            label="Branch"
            value={iteration.branchName ?? 'Provisioning not complete'}
            mono
          />
          <Detail label="Candidate" value={iteration.sourceCandidateId} mono />
          <Detail
            label="Candidate SHA-256"
            value={iteration.sourceCandidateSha256}
            mono
          />
          <Detail
            label="Admitted"
            value={formatDateTime(iteration.admittedAt)}
          />
          <Detail label="Version" value={String(iteration.version)} />
        </div>
      </CardContent>
    </Card>
  );
}

export function IterationIntakeDetailView({
  resourceState,
}: {
  resourceState: State<IterationIntakeResource>;
}) {
  const intake = resourceState.data;
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle aria-level={1} role="heading">
            Frozen Intake
          </CardTitle>
          <CardDescription>
            Self-contained Candidate and exact Revision snapshots ·{' '}
            {formatDateTime(intake.frozenAt)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              This content is validated without reading live Inbox Items,
              providers, or mutable Candidate records.
            </AlertDescription>
          </Alert>
          <Detail label="Intake SHA-256" value={intake.contentSha256} mono />
          <Separator />
          <CandidateSnapshot candidate={intake.candidate} />
        </CardContent>
      </Card>
      <FrozenSources sources={intake.sources} />
    </div>
  );
}

export function KickoffDetailView({
  resourceState,
}: {
  resourceState: State<KickoffResource>;
}) {
  const [kickoffState, setKickoffState] = useState(resourceState);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmedCard, setConfirmedCard] = useState<StoryCardResource | null>(
    null,
  );
  const kickoff = kickoffState.data;
  const proposal = kickoff.currentProposal;
  const bridge = window.evidenceDesktop;

  const refresh = async () => {
    setKickoffState(
      (await kickoffState.follow('self').refresh()) as State<KickoffResource>,
    );
  };

  const runAnalyst = async () => {
    if (!bridge?.runKickoffAnalyst || pending) return;
    setPending(true);
    setError(null);
    setProgress('Revising the Frozen Intake…');
    try {
      await bridge.runKickoffAnalyst(
        {
          id: requestId('kickoff'),
          workspaceId: workspaceId(kickoffState),
          iterationId: kickoff.iteration.id,
        },
        (event) => {
          if (event.event === 'progress') setProgress(event.data);
          if (event.event === 'tool-start') {
            setProgress('Submitting the replacement Proposal…');
          }
          if (event.event === 'error') setError(event.data);
        },
      );
      await refresh();
    } catch (caught) {
      setError(
        errorMessage(
          caught,
          'The Kickoff Analyst could not revise the Proposal.',
        ),
      );
    } finally {
      setPending(false);
      setProgress(null);
    }
  };

  const decide = async (
    action: KickoffDecisionAction,
    reason: string | null,
  ) => {
    if (!proposal || !kickoffState.getLink('decide') || pending) return;
    setPending(true);
    setError(null);
    try {
      const input: KickoffDecisionInput = {
        proposalId: proposal.id,
        proposalSha256: proposal.contentSha256,
        expectedIterationVersion: kickoff.iteration.version,
        action,
        reason,
      };
      const result = (await kickoffState.follow('decide').post({
        data: input,
      })) as State<KickoffDecisionResultResource>;
      setConfirmedCard(result.data.storyCard);
      if (action === 'revise') {
        if (!bridge?.runKickoffAnalyst) {
          setError(
            'Revise was recorded. Open Evidence Desktop to run the local Kickoff Analyst.',
          );
          await refresh();
        } else {
          setPending(false);
          await runAnalyst();
          return;
        }
      } else {
        await refresh();
      }
    } catch (caught) {
      setError(
        errorMessage(caught, 'The Kickoff Decision could not be recorded.'),
      );
      throw caught;
    } finally {
      setPending(false);
    }
  };

  const drafting =
    kickoff.iteration.lifecycle === 'active' &&
    kickoff.iteration.loop === 'kickoff' &&
    kickoff.iteration.stage === 'candidate_drafting';

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle aria-level={1} role="heading">
                {kickoff.iteration.reference} Kickoff
              </CardTitle>
              <Badge>{formatLabel(kickoff.iteration.lifecycle)}</Badge>
              <Badge variant="outline">
                {formatLabel(kickoff.iteration.stage)}
              </Badge>
            </div>
            <CardDescription>
              Human authority is required for every confirm, revise, split,
              defer, or stop Decision.
            </CardDescription>
          </div>
          {drafting && !proposal ? (
            <Button
              disabled={pending || !bridge?.runKickoffAnalyst}
              type="button"
              onClick={() => void runAnalyst()}
            >
              {pending ? 'Revising…' : 'Run local Kickoff Analyst'}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {!bridge?.runKickoffAnalyst && drafting && !proposal ? (
            <Alert>
              <AlertDescription>
                Open Evidence Desktop to draft the replacement from Frozen
                Intake and prior human Decisions.
              </AlertDescription>
            </Alert>
          ) : null}
          {progress ? (
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {progress}
            </p>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {confirmedCard ? (
            <AuthoritativeStoryCard card={confirmedCard} />
          ) : null}
        </CardContent>
      </Card>

      {proposal ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle aria-level={2} role="heading">
                {proposal.title}
              </CardTitle>
              <Badge variant="secondary">{proposal.reference}</Badge>
              <Badge variant="outline">{formatLabel(proposal.origin)}</Badge>
            </div>
            <CardDescription>
              Proposal only · {proposal.contentSha256}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Detail label="Role" value={proposal.role} />
              <Detail label="Problem" value={proposal.problem} />
              <Detail label="Goal" value={proposal.goal} />
              <Detail label="Value" value={proposal.value} />
            </div>
            {kickoff.iteration.lifecycle === 'active' &&
            kickoff.iteration.loop === 'kickoff' &&
            kickoff.iteration.stage === 'candidate_review' ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={pending}
                  type="button"
                  onClick={() => void decide('confirm', null)}
                >
                  Confirm as US-001
                </Button>
                {(['revise', 'split', 'defer', 'stop'] as const).map(
                  (action) => (
                    <KickoffDecisionDialog
                      key={action}
                      action={action}
                      disabled={pending}
                      onDecide={decide}
                    />
                  ),
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle aria-level={2} role="heading">
            Frozen Candidate
          </CardTitle>
          <CardDescription>
            The Kickoff Proposal and every replacement remain bounded by this
            immutable Intake.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CandidateSnapshot candidate={kickoff.intake.candidate} />
        </CardContent>
      </Card>
      <FrozenSources sources={kickoff.intake.sources} />
      <DecisionHistory decisions={kickoff.decisions} />
    </div>
  );
}

function KickoffDecisionDialog({
  action,
  disabled,
  onDecide,
}: {
  action: Exclude<KickoffDecisionAction, 'confirm'>;
  disabled: boolean;
  onDecide: (
    action: KickoffDecisionAction,
    reason: string | null,
  ) => Promise<void>;
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
        errorMessage(caught, 'The Kickoff Decision could not be recorded.'),
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
          <DialogTitle>{formatLabel(action)} this Kickoff</DialogTitle>
          <DialogDescription>
            Record the human reason. This Decision is append-only.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`kickoff-${action}-reason`}>
                Reason
              </FieldLabel>
              <Textarea
                id={`kickoff-${action}-reason`}
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

function AuthoritativeStoryCard({ card }: { card: StoryCardResource }) {
  return (
    <Alert>
      <AlertDescription>
        <strong>
          {card.reference}: {card.title}
        </strong>
        <span className="mt-1 block">
          As a {card.role}, {card.goal}, so that {card.value}
        </span>
      </AlertDescription>
    </Alert>
  );
}

function CandidateSnapshot({
  candidate,
}: {
  candidate: IterationIntakeResource['data']['candidate'];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Detail
        label="Candidate"
        value={`${candidate.candidateReference} · ${candidate.title}`}
      />
      <Detail label="Role" value={candidate.role} />
      <Detail label="Problem" value={candidate.problem} />
      <Detail label="Goal" value={candidate.goal} />
      <Detail label="Value" value={candidate.value} />
      <Detail label="Candidate SHA-256" value={candidate.contentSha256} mono />
    </div>
  );
}

function FrozenSources({
  sources,
}: {
  sources: IterationIntakeResource['data']['sources'];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          Frozen sources
        </CardTitle>
        <CardDescription>
          {sources.length} exact immutable Revision snapshot(s).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sources.map((source, index) => (
          <div key={source.inboxRevisionId}>
            {index > 0 ? <Separator className="mb-4" /> : null}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{source.title}</p>
                <Badge variant="outline">
                  Revision {source.revisionNumber}
                </Badge>
              </div>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {source.contentSha256}
              </p>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                {source.body}
              </pre>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DecisionHistory({
  decisions,
}: {
  decisions: KickoffResource['data']['decisions'];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          Decision history
        </CardTitle>
        <CardDescription>Append-only human Kickoff authority.</CardDescription>
      </CardHeader>
      <CardContent>
        {decisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No Decisions recorded.
          </p>
        ) : (
          <ol className="space-y-3">
            {decisions.map((decision) => (
              <li key={decision.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{formatLabel(decision.action)}</Badge>
                  <span className="font-mono text-xs">
                    {decision.reference}
                  </span>
                </div>
                {decision.reason ? (
                  <p className="mt-2">{decision.reason}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function Detail({
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

function workspaceId(state: State<KickoffResource>): string {
  const href = state.getLink('iteration')?.href;
  const match = href && /\/workspaces\/([^/?#]+)/.exec(href);
  if (!match?.[1])
    throw new Error('Kickoff is missing its Workspace identity.');
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
