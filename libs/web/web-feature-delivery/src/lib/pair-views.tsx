import { useRef, useState } from 'react';
import type {
  DecidePairInput,
  DesktopPairDecisionAction,
  PairActionResultResource,
  PairLocalReview,
  PairResource,
  State,
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
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Separator,
  Textarea,
} from '@evidence/ui';

export function PairDetailView({
  resourceState,
}: {
  resourceState: State<PairResource>;
}) {
  const [state, setState] = useState(resourceState);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [commitMessage, setCommitMessage] = useState(
    `feat(desktop): implement ${resourceState.data.story.reference.toLowerCase()}`,
  );
  const [review, setReview] = useState<PairLocalReview | null>(null);
  const activeRequestId = useRef<string | null>(null);
  const pair = state.data;
  const bridge = window.evidenceDesktop;

  const refresh = async () => {
    setState((await state.follow('self').refresh()) as State<PairResource>);
  };

  const resume = async () => {
    if (!bridge?.resumePair || pending) return;
    const id = pairRequestId();
    activeRequestId.current = id;
    setPending(true);
    setError(null);
    setProgress('Claiming the bounded Pair lease…');
    try {
      await bridge.resumePair(pairRequest(pair, id), (event) =>
        setProgress(event.message),
      );
      await refresh();
    } catch (caught) {
      setError(message(caught, 'Pair could not resume.'));
    } finally {
      activeRequestId.current = null;
      setPending(false);
      setProgress(null);
    }
  };

  const loadReview = async () => {
    if (!bridge?.reviewPair || !pair.manifest || pending) return;
    setPending(true);
    setError(null);
    try {
      const loaded = await bridge.reviewPair({
        ...pairRequest(pair, pairRequestId()),
        expectedManifestSha256: pair.manifest.contentSha256,
      });
      setReview(loaded);
    } catch (caught) {
      setError(message(caught, 'The complete local diff could not be loaded.'));
    } finally {
      setPending(false);
    }
  };

  const route = async (action: DesktopPairDecisionAction) => {
    if (!pair.currentException || !reason.trim() || pending) return;
    setPending(true);
    setError(null);
    setProgress(`Recording ${label(action)}…`);
    try {
      if (bridge?.decidePair) {
        const id = pairRequestId();
        activeRequestId.current = id;
        await bridge.decidePair(
          {
            ...pairRequest(pair, id),
            action,
            reason: reason.trim(),
            resume: action !== 'back_tasking' && action !== 'cancel',
          },
          (event) => setProgress(event.message),
        );
      } else {
        const input: DecidePairInput = {
          expectedPairVersion: pair.run.version,
          action,
          reason: reason.trim(),
          manifestSha256: null,
          diffSha256: null,
          commitSha: null,
        };
        (await state
          .follow('decide')
          .post({ data: input })) as State<PairActionResultResource>;
      }
      setReason('');
      setReview(null);
      await refresh();
    } catch (caught) {
      setError(message(caught, 'The Pair route could not be recorded.'));
    } finally {
      activeRequestId.current = null;
      setPending(false);
      setProgress(null);
    }
  };

  const approve = async () => {
    if (
      !bridge?.approvePair ||
      !pair.manifest ||
      !review ||
      !reason.trim() ||
      !commitMessage.trim() ||
      pending
    ) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await bridge.approvePair({
        ...pairRequest(pair, pairRequestId()),
        expectedManifestSha256: review.manifestSha256,
        expectedDiffSha256: review.diffSha256,
        commitMessage: commitMessage.trim(),
        reason: reason.trim(),
      });
      setReason('');
      await refresh();
    } catch (caught) {
      setError(message(caught, 'Pair approval or local commit failed.'));
    } finally {
      setPending(false);
    }
  };

  const cancel = () => {
    if (activeRequestId.current && bridge?.cancelPair) {
      void bridge.cancelPair(activeRequestId.current);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PairSummary pair={pair} />

      {pair.run.status === 'running' ? (
        <Card>
          <CardHeader>
            <CardTitle>Local Pair Controller</CardTitle>
            <CardDescription>
              Resume only in Evidence Desktop. Server remains the sole
              next-action authority.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              disabled={pending || !bridge?.resumePair}
              type="button"
              onClick={() => void resume()}
            >
              {pending ? 'Running…' : 'Resume approved Pair Plan'}
            </Button>
            {!bridge?.resumePair ? (
              <Alert>
                <AlertDescription>
                  Browser mode can inspect bounded Server evidence but cannot
                  run Drivers or commands.
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {pair.run.status === 'exception' && pair.currentException ? (
        <ExceptionDecision
          kind={pair.currentException.kind}
          summary={pair.currentException.summary}
          allowedRoutes={pair.currentException.allowedRoutes}
          disabled={pending}
          reason={reason}
          onReason={setReason}
          onRoute={(action) => void route(action)}
        />
      ) : null}

      {pair.run.status === 'approval_required' && pair.manifest ? (
        <ApprovalCard
          pair={pair}
          review={review}
          commitMessage={commitMessage}
          reason={reason}
          disabled={pending}
          desktopAvailable={Boolean(bridge?.reviewPair && bridge?.approvePair)}
          onCommitMessage={setCommitMessage}
          onReason={setReason}
          onLoadReview={() => void loadReview()}
          onApprove={() => void approve()}
        />
      ) : null}

      {progress ? <p aria-live="polite">{progress}</p> : null}
      {pending && activeRequestId.current && bridge?.cancelPair ? (
        <Button type="button" variant="outline" onClick={cancel}>
          Stop local controller
        </Button>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <ExecutionEvidence pair={pair} />
    </div>
  );
}

function PairSummary({ pair }: { pair: PairResource['data'] }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle aria-level={1} role="heading">
            {pair.story.reference} Pair
          </CardTitle>
          <Badge>{label(pair.run.status)}</Badge>
          <Badge variant="outline">{label(pair.run.checkpoint)}</Badge>
          <Badge variant="secondary">{pair.run.reference}</Badge>
        </div>
        <CardDescription>
          Approved Plan {pair.run.approvedTaskingPlanSha256} · Story Revision{' '}
          {pair.run.storyRevisionSha256}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm md:grid-cols-3">
        <EvidenceValue
          label="Completed TESTs"
          value={String(pair.run.completedTestIds.length)}
        />
        <EvidenceValue
          label="Completed steps"
          value={String(pair.run.completedStepKeys.length)}
        />
        <EvidenceValue
          label="Agent calls"
          value={`${String(pair.run.budgetUsage.agentCalls)} / ${String(pair.run.executionBudget.maxAgentCalls)}`}
        />
        {pair.run.approvedCommitSha ? (
          <EvidenceValue
            label="Approved local commit"
            value={pair.run.approvedCommitSha}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function ExceptionDecision({
  kind,
  summary,
  allowedRoutes,
  disabled,
  reason,
  onReason,
  onRoute,
}: {
  kind: string;
  summary: string;
  allowedRoutes: NonNullable<
    PairResource['data']['currentException']
  >['allowedRoutes'];
  disabled: boolean;
  reason: string;
  onReason: (value: string) => void;
  onRoute: (action: DesktopPairDecisionAction) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Human exception route</CardTitle>
        <CardDescription>
          Choose only a Server-allowed route. Every decision is append-only and
          requires a reason.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert variant="destructive">
          <AlertDescription>
            {label(kind)} — {summary}
          </AlertDescription>
        </Alert>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="pair-route-reason">Decision reason</FieldLabel>
            <Textarea
              id="pair-route-reason"
              value={reason}
              onChange={(event) => onReason(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            {allowedRoutes.map((action) => (
              <Button
                disabled={disabled || !reason.trim() || action === 'approve'}
                key={action}
                type="button"
                variant="outline"
                onClick={() => onRoute(action as DesktopPairDecisionAction)}
              >
                {label(action)}
              </Button>
            ))}
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function ApprovalCard({
  pair,
  review,
  commitMessage,
  reason,
  disabled,
  desktopAvailable,
  onCommitMessage,
  onReason,
  onLoadReview,
  onApprove,
}: {
  pair: PairResource['data'];
  review: PairLocalReview | null;
  commitMessage: string;
  reason: string;
  disabled: boolean;
  desktopAvailable: boolean;
  onCommitMessage: (value: string) => void;
  onReason: (value: string) => void;
  onLoadReview: () => void;
  onApprove: () => void;
}) {
  const manifest = pair.manifest;
  if (!manifest) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Story-level coding approval</CardTitle>
        <CardDescription>
          Quality gates passed. Load and inspect the complete local diff before
          creating one local commit. Pair does not merge or push.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert>
          <AlertDescription>
            Manifest {manifest.contentSha256} · Diff {manifest.finalDiffSha256}
          </AlertDescription>
        </Alert>
        <Button
          disabled={disabled || !desktopAvailable}
          type="button"
          variant="outline"
          onClick={onLoadReview}
        >
          Load complete local Story diff
        </Button>
        {!desktopAvailable ? (
          <Alert>
            <AlertDescription>
              Open Evidence Desktop to inspect the full diff and complete local
              commit approval.
            </AlertDescription>
          </Alert>
        ) : null}
        {review ? (
          <section aria-labelledby="pair-diff-heading">
            <h2 className="font-medium" id="pair-diff-heading">
              Complete Story diff ({review.changedFileCount} files)
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {review.changedPaths.join(', ')}
            </p>
            <pre className="mt-3 max-h-[36rem] overflow-auto rounded-lg border bg-muted p-3 text-xs whitespace-pre">
              {review.diff}
            </pre>
          </section>
        ) : null}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="pair-commit-message">
              Conventional Commit message
            </FieldLabel>
            <Input
              id="pair-commit-message"
              value={commitMessage}
              onChange={(event) => onCommitMessage(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="pair-approval-reason">
              Approval reason
            </FieldLabel>
            <Textarea
              id="pair-approval-reason"
              value={reason}
              onChange={(event) => onReason(event.target.value)}
            />
          </Field>
          <Button
            disabled={
              disabled ||
              !review ||
              !reason.trim() ||
              !commitMessage.trim() ||
              review.manifestSha256 !== manifest.contentSha256 ||
              review.diffSha256 !== manifest.finalDiffSha256
            }
            type="button"
            onClick={onApprove}
          >
            Create local commit and approve Pair
          </Button>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function ExecutionEvidence({ pair }: { pair: PairResource['data'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bounded execution evidence</CardTitle>
        <CardDescription>
          Server stores hashes, relative paths, outcomes, and summaries—not
          source, full diff, prompts, or command output.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <EvidenceList
          heading="Driver attempts"
          empty="No Driver attempts recorded."
          items={pair.driverAttempts.map((attempt) => ({
            id: attempt.id,
            badges: [attempt.role, attempt.mode],
            title: attempt.summary,
            detail: `${attempt.changedPaths.join(', ') || 'No-op'} · diff ${attempt.diffSha256}`,
          }))}
        />
        <Separator />
        <EvidenceList
          heading="Command observations"
          empty="No command observations recorded."
          items={pair.commandObservations.map((observation) => ({
            id: observation.id,
            badges: [observation.stage, observation.termination],
            title: observation.command,
            detail: `exit ${observation.exitCode === null ? 'none' : String(observation.exitCode)} · stdout ${observation.stdoutSha256} (${observation.stdoutBytes} bytes) · stderr ${observation.stderrSha256} (${observation.stderrBytes} bytes)`,
          }))}
        />
        <Separator />
        <EvidenceList
          heading="Independent Red Reviews"
          empty="No Red Reviews recorded."
          items={pair.redReviews.map((review) => ({
            id: review.id,
            badges: [
              review.classification,
              review.accepted ? 'accepted' : 'rejected',
            ],
            title: review.reason,
            detail: `Observation ${review.observationId}`,
          }))}
        />
        {pair.manifest ? (
          <>
            <Separator />
            <section aria-labelledby="pair-manifest-heading">
              <h2 className="font-medium" id="pair-manifest-heading">
                Execution Manifest
              </h2>
              <p className="mt-2 break-all text-sm">
                {pair.manifest.contentSha256}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {pair.manifest.completedTestIds.length} TESTs ·{' '}
                {pair.manifest.completedStepKeys.length} process steps · diff{' '}
                {pair.manifest.finalDiffSha256}
              </p>
            </section>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function EvidenceList({
  heading,
  empty,
  items,
}: {
  heading: string;
  empty: string;
  items: Array<{
    id: string;
    badges: string[];
    title: string;
    detail: string;
  }>;
}) {
  const id = `evidence-${heading.toLowerCase().replaceAll(' ', '-')}`;
  return (
    <section aria-labelledby={id}>
      <h2 className="font-medium" id={id}>
        {heading}
      </h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-3">
          {items.map((item) => (
            <li className="rounded-lg border p-3" key={item.id}>
              <div className="flex flex-wrap gap-2">
                {item.badges.map((badge) => (
                  <Badge key={badge} variant="outline">
                    {label(badge)}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-sm">{item.title}</p>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                {item.detail}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function EvidenceValue({
  label: name,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground">{name}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function pairRequest(pair: PairResource['data'], id: string) {
  return {
    id,
    workspaceId: pair.run.workspaceId,
    iterationId: pair.run.iterationId,
  };
}

function pairRequestId(): string {
  return `pair:${globalThis.crypto?.randomUUID?.() ?? String(Date.now())}`;
}

function label(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
