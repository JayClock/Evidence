import { useState } from 'react';
import type {
  DeskCheckAction,
  DeskCheckDecisionInput,
  DeskCheckDecisionResultResource,
  State,
  TaskingResource,
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
  Separator,
  Textarea,
} from '@evidence/ui';

const RETURN_ACTIONS: DeskCheckAction[] = [
  'revise',
  'architecture_gap',
  'process_gap',
  'scenario_gap',
];

export function TaskingDetailView({
  resourceState,
}: {
  resourceState: State<TaskingResource>;
}) {
  const [state, setState] = useState(resourceState);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tasking = state.data;
  const candidate = tasking.currentCandidate;
  const bridge = window.evidenceDesktop;

  const refresh = async () => {
    setState((await state.follow('self').refresh()) as State<TaskingResource>);
  };

  const runAnalyst = async () => {
    if (!bridge?.runTaskingAnalyst || pending) return;
    setPending(true);
    setError(null);
    setProgress('Preparing the bounded Nx project catalog…');
    try {
      await bridge.runTaskingAnalyst(
        {
          id: requestId(),
          workspaceId: workspaceId(state),
          iterationId: tasking.iteration.id,
        },
        (event) => {
          if (event.event === 'progress') setProgress(event.data);
          if (event.event === 'tool-start') {
            setProgress('Validating and recording the Tasking Candidate…');
          }
          if (event.event === 'error') setError(event.data);
        },
      );
      await refresh();
    } catch (caught) {
      setError(message(caught, 'The Tasking Analyst could not complete.'));
    } finally {
      setPending(false);
      setProgress(null);
    }
  };

  const decide = async (action: DeskCheckAction) => {
    if (!candidate || !state.getLink('decide') || pending) return;
    if (action !== 'approve' && !reason.trim()) return;
    setPending(true);
    setError(null);
    try {
      const input: DeskCheckDecisionInput = {
        expectedIterationVersion: tasking.iteration.version,
        candidateId: candidate.id,
        candidateSha256: candidate.contentSha256,
        action,
        reason: action === 'approve' ? null : reason.trim(),
      };
      (await state.follow('decide').post({
        data: input,
      })) as State<DeskCheckDecisionResultResource>;
      setReason('');
      await refresh();
    } catch (caught) {
      setError(message(caught, 'The Desk Check decision could not be saved.'));
    } finally {
      setPending(false);
    }
  };

  const canDraft =
    tasking.iteration.lifecycle === 'active' &&
    tasking.iteration.loop === 'tasking' &&
    ['drafting', 'knowledge_gap'].includes(tasking.iteration.stage);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle aria-level={1} role="heading">
              {tasking.story.reference} Tasking / Desk Check
            </CardTitle>
            <Badge>{formatLabel(tasking.iteration.stage)}</Badge>
            <Badge variant="outline">
              Story Revision v{tasking.storyRevision.revisionNumber}
            </Badge>
          </div>
          <CardDescription>
            One complete Candidate locks the confirmed Scenarios, no-model
            decision, Nx ownership, v3 processes, commands, and quality gates.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {tasking.noModelImpactDecision ? (
            <Alert>
              <AlertDescription>
                {tasking.noModelImpactDecision.reference}: tool / none / false —{' '}
                {tasking.noModelImpactDecision.reason}
              </AlertDescription>
            </Alert>
          ) : null}
          {canDraft ? (
            <Button
              disabled={pending || !bridge?.runTaskingAnalyst}
              type="button"
              onClick={() => void runAnalyst()}
            >
              {pending ? 'Running…' : 'Run local Tasking Analyst'}
            </Button>
          ) : null}
          {canDraft && !bridge?.runTaskingAnalyst ? (
            <Alert>
              <AlertDescription>
                Open Evidence Desktop to run the local Tasking Analyst. Browser
                mode never falls back to a Server Agent.
              </AlertDescription>
            </Alert>
          ) : null}
          {tasking.approvedPlan ? (
            <Alert>
              <AlertDescription>
                Approved Plan {tasking.approvedPlan.contentSha256} is locked as
                v{tasking.approvedPlan.plan.planVersion} Pair authority. Its
                execution envelope allows{' '}
                {tasking.approvedPlan.plan.executionBudget.maxAgentCalls} Agent
                calls and{' '}
                {tasking.approvedPlan.plan.executionBudget.maxCheckpoints}{' '}
                checkpoints.
              </AlertDescription>
            </Alert>
          ) : null}
          {progress ? <p aria-live="polite">{progress}</p> : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {candidate ? <CandidateReview candidate={candidate} /> : null}

      {candidate && tasking.iteration.stage === 'desk_check' ? (
        <Card>
          <CardHeader>
            <CardTitle>Human Desk Check</CardTitle>
            <CardDescription>
              Approval locks this exact Candidate. Every return route records a
              reason and preserves prior evidence.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="desk-check-reason">
                  Reason for revise or gap routing
                </FieldLabel>
                <Textarea
                  id="desk-check-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={pending}
                  type="button"
                  onClick={() => void decide('approve')}
                >
                  Approve exact plan
                </Button>
                {RETURN_ACTIONS.map((action) => (
                  <Button
                    disabled={pending || !reason.trim()}
                    key={action}
                    type="button"
                    variant="outline"
                    onClick={() => void decide(action)}
                  >
                    {formatLabel(action)}
                  </Button>
                ))}
              </div>
            </FieldGroup>
          </CardContent>
        </Card>
      ) : null}

      {tasking.decisions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Desk Check history</CardTitle>
            <CardDescription>Append-only human decisions.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-3">
              {tasking.decisions.map((decision) => (
                <li className="rounded-lg border p-3" key={decision.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{decision.reference}</Badge>
                    <Badge variant="outline">
                      {formatLabel(decision.action)}
                    </Badge>
                  </div>
                  {decision.reason ? (
                    <p className="mt-2 text-sm">{decision.reason}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function CandidateReview({
  candidate,
}: {
  candidate: NonNullable<TaskingResource['data']['currentCandidate']>;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{candidate.reference}</CardTitle>
          <Badge variant="secondary">{candidate.contentSha256}</Badge>
        </div>
        <CardDescription>
          Plan v{candidate.planVersion} · Baseline {candidate.baseCommitSha} ·
          Project catalog {candidate.projectCatalogSha256}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Alert>
          <AlertDescription>
            Pair envelope: {candidate.executionBudget.maxAgentCalls} Agent
            calls, {candidate.executionBudget.maxCheckpoints} checkpoints,{' '}
            {candidate.executionBudget.commandTimeoutMs} ms per command, and{' '}
            {candidate.executionBudget.maxRetriesPerFingerprint} retries per
            failure fingerprint.
          </AlertDescription>
        </Alert>

        <section aria-labelledby="tasking-tests-heading">
          <h2 className="font-medium" id="tasking-tests-heading">
            Q1 / Q2 test list
          </h2>
          <ol className="mt-3 flex flex-col gap-3">
            {candidate.tests.map((test) => (
              <li className="rounded-lg border p-3" key={test.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{test.id}</Badge>
                  <Badge variant="outline">{test.quadrant}</Badge>
                  <Badge variant="secondary">{test.stepId}</Badge>
                </div>
                <p className="mt-2">{test.intent}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Scenarios: {test.scenarioIds.join(', ')}
                  {test.scenarioOutcome
                    ? ` · Then: ${test.scenarioOutcome}`
                    : ''}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <Separator />

        <section aria-labelledby="tasking-processes-heading">
          <h2 className="font-medium" id="tasking-processes-heading">
            Materialized processes and gates
          </h2>
          <div className="mt-3 flex flex-col gap-3">
            {candidate.processes.map((process) => (
              <div
                className="rounded-lg border p-3"
                key={process.runtimePlanId}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>
                    {process.processId} v{process.processVersion}
                  </Badge>
                  <Badge variant="outline">{process.runtimePlanId}</Badge>
                </div>
                <CommandList
                  label="Focused commands"
                  values={process.focusedCommands.map(({ command }) => command)}
                />
                <CommandList
                  label="Locked quality gates"
                  values={process.qualityGates.map(({ command }) => command)}
                />
              </div>
            ))}
          </div>
        </section>

        <Separator />

        <section aria-labelledby="tasking-tasks-heading">
          <h2 className="font-medium" id="tasking-tasks-heading">
            Dependency-ordered TASKs
          </h2>
          <ol className="mt-3 flex flex-col gap-3">
            {candidate.tasks.map((task) => (
              <li className="rounded-lg border p-3" key={task.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{task.id}</Badge>
                  <Badge variant="outline">
                    TESTs {task.testIds.join(', ')}
                  </Badge>
                </div>
                <p className="mt-2">{task.description}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Depends on: {task.dependsOn.join(', ') || 'none'}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </CardContent>
    </Card>
  );
}

function CommandList({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="mt-3">
      <p className="text-sm font-medium">{label}</p>
      <ul className="mt-1 flex flex-col gap-1 font-mono text-xs text-muted-foreground">
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </div>
  );
}

function workspaceId(state: State<TaskingResource>): string {
  const href = state.getLink('iteration')?.href;
  const match = href && /\/workspaces\/([^/?#]+)/.exec(href);
  if (!match?.[1])
    throw new Error('Tasking is missing its Workspace identity.');
  return decodeURIComponent(match[1]);
}

function requestId(): string {
  return `tasking:${globalThis.crypto?.randomUUID?.() ?? String(Date.now())}`;
}

function formatLabel(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
