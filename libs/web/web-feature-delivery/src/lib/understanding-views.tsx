import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type {
  AnswerClarificationInput,
  NoModelImpactDecisionResource,
  RecordNoModelImpactInput,
  State,
  UnderstandingDecisionInput,
  UnderstandingDecisionResultResource,
  UnderstandingResource,
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

export function UnderstandingDetailView({
  resourceState,
}: {
  resourceState: State<UnderstandingResource>;
}) {
  const [state, setState] = useState(resourceState);
  const [answer, setAnswer] = useState('');
  const [reason, setReason] = useState('');
  const [modelReason, setModelReason] = useState('');
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const understanding = state.data;
  const bridge = window.evidenceDesktop;

  const refresh = async () => {
    setState(
      (await state.follow('self').refresh()) as State<UnderstandingResource>,
    );
  };

  const runAnalyst = async () => {
    if (!bridge?.runUnderstandingAnalyst || pending) return;
    setPending(true);
    setError(null);
    setProgress('Clarifying the active Story…');
    try {
      await bridge.runUnderstandingAnalyst(
        {
          id: requestId(),
          workspaceId: workspaceId(state),
          iterationId: understanding.iteration.id,
        },
        (event) => {
          if (event.event === 'progress') setProgress(event.data);
          if (event.event === 'tool-start') {
            setProgress('Recording the Analyst proposal…');
          }
          if (event.event === 'error') setError(event.data);
        },
      );
      await refresh();
    } catch (caught) {
      setError(
        message(caught, 'The TQA Analyst could not complete this turn.'),
      );
    } finally {
      setPending(false);
      setProgress(null);
    }
  };

  const submitAnswer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const current = understanding.pendingClarification;
    if (!current || !answer.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      const input: AnswerClarificationInput = {
        expectedIterationVersion: understanding.iteration.version,
        answer: answer.trim(),
      };
      await state.follow('answer-question').post({ data: input });
      setAnswer('');
      await refresh();
    } catch (caught) {
      setError(
        message(caught, 'The clarification answer could not be recorded.'),
      );
    } finally {
      setPending(false);
    }
  };

  const recordNoModelImpact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !state.getLink('record-no-model-impact') ||
      !modelReason.trim() ||
      pending
    )
      return;
    setPending(true);
    setError(null);
    try {
      const input: RecordNoModelImpactInput = {
        expectedIterationVersion: understanding.iteration.version,
        storyId: understanding.story.id,
        storyRevisionId: understanding.storyRevision.id,
        storyRevisionSha256: understanding.storyRevision.contentSha256,
        reason: modelReason.trim(),
      };
      (await state.follow('record-no-model-impact').post({
        data: input,
      })) as State<NoModelImpactDecisionResource>;
      setModelReason('');
      await refresh();
    } catch (caught) {
      setError(
        message(caught, 'The No Model Impact decision could not be recorded.'),
      );
    } finally {
      setPending(false);
    }
  };

  const decide = async (action: UnderstandingDecisionInput['action']) => {
    if (!state.getLink('decide') || pending) return;
    const proposal = understanding.currentScenarioProposal;
    setPending(true);
    setError(null);
    try {
      const input: UnderstandingDecisionInput = {
        expectedIterationVersion: understanding.iteration.version,
        action,
        proposalId: proposal?.id ?? null,
        proposalSha256: proposal?.contentSha256 ?? null,
        selectedDraftIds:
          action === 'confirm'
            ? (proposal?.drafts.map(({ id }) => id) ?? [])
            : [],
        reason: action === 'confirm' ? null : reason.trim(),
      };
      (await state.follow('decide').post({
        data: input,
      })) as State<UnderstandingDecisionResultResource>;
      setReason('');
      await refresh();
    } catch (caught) {
      setError(
        message(caught, 'The Understand decision could not be recorded.'),
      );
    } finally {
      setPending(false);
    }
  };

  const canRun =
    understanding.iteration.lifecycle === 'active' &&
    understanding.iteration.loop === 'understand' &&
    understanding.iteration.stage === 'tqa' &&
    !understanding.pendingClarification;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle aria-level={1} role="heading">
              {understanding.story.reference} Understand / TQA
            </CardTitle>
            <Badge>{formatLabel(understanding.iteration.stage)}</Badge>
            <Badge variant="outline">
              Story Revision v{understanding.storyRevision.revisionNumber}
            </Badge>
          </div>
          <CardDescription>
            One business question or one complete Scenario Set per Analyst turn.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {canRun ? (
            <Button
              disabled={pending || !bridge?.runUnderstandingAnalyst}
              type="button"
              onClick={() => void runAnalyst()}
            >
              {pending ? 'Running…' : 'Run local TQA Analyst'}
            </Button>
          ) : null}
          {canRun && !bridge?.runUnderstandingAnalyst ? (
            <Alert>
              <AlertDescription>
                Open Evidence Desktop to run the local TQA Analyst. Browser mode
                never falls back to a Server Agent.
              </AlertDescription>
            </Alert>
          ) : null}
          {progress ? <p aria-live="polite">{progress}</p> : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {understanding.iteration.stage === 'modeling' ? (
            <form onSubmit={(event) => void recordNoModelImpact(event)}>
              <FieldGroup>
                <Alert>
                  <AlertDescription>
                    This release supports only an explicit human no-model-impact
                    route for tool or glue Stories. Do not use it when domain
                    impact exists or is uncertain.
                  </AlertDescription>
                </Alert>
                <Field>
                  <FieldLabel htmlFor="no-model-impact-reason">
                    Why this Story is tool / none / false
                  </FieldLabel>
                  <Textarea
                    id="no-model-impact-reason"
                    required
                    value={modelReason}
                    onChange={(event) => setModelReason(event.target.value)}
                  />
                </Field>
                <Button disabled={pending || !modelReason.trim()} type="submit">
                  Record No Model Impact
                </Button>
              </FieldGroup>
            </form>
          ) : null}
          {state.getLink('tasking') ? (
            <Button asChild>
              <Link to={state.getLink('tasking')?.href ?? '#'}>
                Open Tasking / Desk Check
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {understanding.pendingClarification ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>
                {understanding.pendingClarification.reference}
              </CardTitle>
              <Badge variant="secondary">
                {formatLabel(understanding.pendingClarification.target)}
              </Badge>
            </div>
            <CardDescription>
              {understanding.pendingClarification.question}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(event) => void submitAnswer(event)}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="clarification-answer">
                    Domain expert answer
                  </FieldLabel>
                  <Textarea
                    id="clarification-answer"
                    required
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                  />
                </Field>
                <Button disabled={pending || !answer.trim()} type="submit">
                  Record explicit answer
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {understanding.currentScenarioProposal ? (
        <Card>
          <CardHeader>
            <CardTitle>Complete Scenario Proposal</CardTitle>
            <CardDescription>
              {understanding.currentScenarioProposal.reference} ·{' '}
              {understanding.currentScenarioProposal.contentSha256}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {understanding.currentScenarioProposal.drafts.map(
              (draft, index) => (
                <div className="flex flex-col gap-3" key={draft.id}>
                  {index > 0 ? <Separator /> : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{draft.reference}</Badge>
                    <strong>{draft.title}</strong>
                  </div>
                  <Phase label="Given" values={draft.given} />
                  <Phase label="When" values={[draft.when]} />
                  <Phase label="Then" values={draft.then} />
                  <Phase label="Business data" values={draft.businessData} />
                </div>
              ),
            )}
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="understand-reason">
                  Reason for continue, split, or defer
                </FieldLabel>
                <Textarea
                  id="understand-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={pending}
                  onClick={() => void decide('confirm')}
                >
                  Confirm complete set
                </Button>
                {(['continue', 'split', 'defer'] as const).map((action) => (
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

      <Card>
        <CardHeader>
          <CardTitle>Clarification history</CardTitle>
          <CardDescription>Append-only Conversation evidence.</CardDescription>
        </CardHeader>
        <CardContent>
          {understanding.clarifications.length === 0 ? (
            <p>No clarification has been required.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {understanding.clarifications.map((item) => (
                <li className="rounded-lg border p-3" key={item.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{item.reference}</Badge>
                    <Badge variant="outline">{formatLabel(item.status)}</Badge>
                  </div>
                  <p className="mt-2">{item.question}</p>
                  {item.answer ? (
                    <p className="mt-2">Answer: {item.answer}</p>
                  ) : null}
                  {item.waivedReason ? (
                    <p className="mt-2">Waived: {item.waivedReason}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Phase({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <ul className="list-disc pl-5 text-sm text-muted-foreground">
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </div>
  );
}

function workspaceId(state: State<UnderstandingResource>): string {
  const href = state.getLink('iteration')?.href;
  const match = href && /\/workspaces\/([^/?#]+)/.exec(href);
  if (!match?.[1])
    throw new Error('Understanding is missing its Workspace identity.');
  return decodeURIComponent(match[1]);
}

function requestId(): string {
  return `tqa:${globalThis.crypto?.randomUUID?.() ?? String(Date.now())}`;
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
