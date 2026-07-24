import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  State,
  StoryCognitiveMode,
  StoryResource,
  StoryRevisionInput,
  StoryRevisionResource,
} from '@evidence/api-client';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardAction,
  CardContent,
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@evidence/ui';

const cognitiveModes: StoryCognitiveMode[] = [
  'clear',
  'complicated',
  'complex',
];

interface ScenarioDraft {
  key: string;
  title: string;
  given: string[];
  when: string;
  then: string[];
}

export function CreateStoryRevisionDialog({
  storyState,
  latestRevisionState,
}: {
  storyState: State<StoryResource>;
  latestRevisionState: State<StoryRevisionResource>;
}) {
  const navigate = useNavigate();
  const story = storyState.data;
  const revision = latestRevisionState.data;
  const keyCounter = useRef(0);
  const nextKey = () => `scenario-draft-${String(++keyCounter.current)}`;
  const initialScenarios = () =>
    revision.scenarios.length > 0
      ? revision.scenarios.map((scenario) => ({
          key: scenario.id,
          title: scenario.title,
          given: [...scenario.given],
          when: scenario.when,
          then: [...scenario.then],
        }))
      : [emptyScenario(nextKey())];

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(revision.title);
  const [problem, setProblem] = useState(revision.problem);
  const [role, setRole] = useState(revision.role);
  const [goal, setGoal] = useState(revision.goal);
  const [value, setValue] = useState(revision.value);
  const [cognitiveMode, setCognitiveMode] = useState<StoryCognitiveMode>(
    revision.cognitiveMode,
  );
  const [scenarios, setScenarios] = useState<ScenarioDraft[]>(initialScenarios);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle(revision.title);
    setProblem(revision.problem);
    setRole(revision.role);
    setGoal(revision.goal);
    setValue(revision.value);
    setCognitiveMode(revision.cognitiveMode);
    setScenarios(initialScenarios());
    setSubmitted(false);
    setError(null);
  };

  const updateScenario = (
    index: number,
    update: (scenario: ScenarioDraft) => ScenarioDraft,
  ) => {
    setScenarios((current) =>
      current.map((scenario, scenarioIndex) =>
        scenarioIndex === index ? update(scenario) : scenario,
      ),
    );
  };

  const updateStep = (
    scenarioIndex: number,
    phase: 'given' | 'then',
    stepIndex: number,
    step: string,
  ) => {
    updateScenario(scenarioIndex, (scenario) => ({
      ...scenario,
      [phase]: scenario[phase].map((currentStep, currentIndex) =>
        currentIndex === stepIndex ? step : currentStep,
      ),
    }));
  };

  const addStep = (scenarioIndex: number, phase: 'given' | 'then') => {
    updateScenario(scenarioIndex, (scenario) => ({
      ...scenario,
      [phase]: [...scenario[phase], ''],
    }));
  };

  const removeStep = (
    scenarioIndex: number,
    phase: 'given' | 'then',
    stepIndex: number,
  ) => {
    updateScenario(scenarioIndex, (scenario) => ({
      ...scenario,
      [phase]: scenario[phase].filter((_, index) => index !== stepIndex),
    }));
  };

  const moveScenario = (index: number, offset: -1 | 1) => {
    setScenarios((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const moved = [...current];
      [moved[index], moved[target]] = [moved[target], moved[index]];
      return moved;
    });
  };

  const complete = formComplete({
    title,
    problem,
    role,
    goal,
    value,
    scenarios,
  });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (pending || !complete) return;

    const input: StoryRevisionInput = {
      expectedVersion: story.version,
      expectedLatestRevisionId: story.latestRevisionId,
      title: title.trim(),
      problem: problem.trim(),
      role: role.trim(),
      goal: goal.trim(),
      value: value.trim(),
      cognitiveMode,
      citations: revision.citations.map((citation) => ({
        inboxItemId: citation.inboxItemId,
        inboxRevisionId: citation.inboxRevisionId,
        contentSha256: citation.contentSha256,
        locator: citation.locator,
      })),
      scenarios: scenarios.map((scenario) => ({
        title: scenario.title.trim(),
        given: scenario.given.map((step) => step.trim()),
        when: scenario.when.trim(),
        then: scenario.then.map((step) => step.trim()),
      })),
    };

    setPending(true);
    setError(null);
    try {
      const created = await storyState
        .follow('create-revision')
        .post({ data: input });
      const href = created.getLink('self')?.href;
      setOpen(false);
      if (href) navigate(href);
    } catch (caught) {
      setError(
        errorMessage(
          caught,
          'The Story changed or the Revision could not be confirmed. Refresh before retrying.',
        ),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (pending) return;
        if (nextOpen) reset();
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger asChild>
        <Button>Confirm acceptance revision</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Confirm Story Revision v{story.latestRevisionNumber + 1}
          </DialogTitle>
          <DialogDescription>
            Clarify the Story and confirm its complete Scenario Set. The new
            Revision is immutable after creation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field data-invalid={submitted && !title.trim()}>
              <FieldLabel htmlFor="revision-title">Title</FieldLabel>
              <Input
                id="revision-title"
                aria-invalid={submitted && !title.trim()}
                maxLength={200}
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <FieldError>
                {submitted && !title.trim() ? 'Enter a Story title.' : null}
              </FieldError>
            </Field>

            <Field data-invalid={submitted && !role.trim()}>
              <FieldLabel htmlFor="revision-role">Role</FieldLabel>
              <Input
                id="revision-role"
                aria-invalid={submitted && !role.trim()}
                maxLength={200}
                required
                value={role}
                onChange={(event) => setRole(event.target.value)}
              />
            </Field>

            <Field data-invalid={submitted && !problem.trim()}>
              <FieldLabel htmlFor="revision-problem">Problem</FieldLabel>
              <Textarea
                id="revision-problem"
                aria-invalid={submitted && !problem.trim()}
                className="min-h-24 resize-y"
                maxLength={2000}
                required
                value={problem}
                onChange={(event) => setProblem(event.target.value)}
              />
            </Field>

            <Field data-invalid={submitted && !goal.trim()}>
              <FieldLabel htmlFor="revision-goal">Goal</FieldLabel>
              <Textarea
                id="revision-goal"
                aria-invalid={submitted && !goal.trim()}
                className="min-h-20 resize-y"
                maxLength={2000}
                required
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
              />
            </Field>

            <Field data-invalid={submitted && !value.trim()}>
              <FieldLabel htmlFor="revision-value">Value</FieldLabel>
              <Textarea
                id="revision-value"
                aria-invalid={submitted && !value.trim()}
                className="min-h-20 resize-y"
                maxLength={2000}
                required
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="revision-cognitive-mode">
                Cognitive mode
              </FieldLabel>
              <Select
                value={cognitiveMode}
                onValueChange={(mode) =>
                  setCognitiveMode(mode as StoryCognitiveMode)
                }
              >
                <SelectTrigger id="revision-cognitive-mode" className="w-full">
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
            </Field>

            <Field>
              <FieldLabel>Source citations</FieldLabel>
              <FieldDescription>
                The exact Inbox Revision citations from v
                {revision.revisionNumber} are copied into the new Revision.
              </FieldDescription>
              <div className="flex flex-col gap-2">
                {revision.citations.map((citation) => (
                  <p
                    className="break-all font-mono text-xs text-muted-foreground"
                    key={`${citation.inboxRevisionId}:${citation.locator}`}
                  >
                    Revision #{citation.inboxRevisionNumber} ·{' '}
                    {citation.locator} · {citation.contentSha256}
                  </p>
                ))}
              </div>
            </Field>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Acceptance scenarios</p>
                <p className="text-sm text-muted-foreground">
                  Scenario and step order is preserved in the Revision hash.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setScenarios((current) => [
                    ...current,
                    emptyScenario(nextKey()),
                  ])
                }
              >
                Add scenario
              </Button>
            </div>

            {scenarios.map((scenario, scenarioIndex) => (
              <Card key={scenario.key} size="sm">
                <CardHeader>
                  <CardTitle>Scenario {scenarioIndex + 1}</CardTitle>
                  <CardAction>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={scenarioIndex === 0}
                        type="button"
                        variant="outline"
                        onClick={() => moveScenario(scenarioIndex, -1)}
                      >
                        Move up
                      </Button>
                      <Button
                        disabled={scenarioIndex === scenarios.length - 1}
                        type="button"
                        variant="outline"
                        onClick={() => moveScenario(scenarioIndex, 1)}
                      >
                        Move down
                      </Button>
                      <Button
                        disabled={scenarios.length === 1}
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setScenarios((current) =>
                            current.filter(
                              (_, index) => index !== scenarioIndex,
                            ),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <FieldGroup>
                    <Field data-invalid={submitted && !scenario.title.trim()}>
                      <FieldLabel htmlFor={`${scenario.key}-title`}>
                        Scenario {scenarioIndex + 1} title
                      </FieldLabel>
                      <Input
                        id={`${scenario.key}-title`}
                        aria-invalid={submitted && !scenario.title.trim()}
                        maxLength={200}
                        required
                        value={scenario.title}
                        onChange={(event) =>
                          updateScenario(scenarioIndex, (current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                      />
                    </Field>

                    <ScenarioStepsField
                      label="Given"
                      phase="given"
                      scenario={scenario}
                      scenarioIndex={scenarioIndex}
                      submitted={submitted}
                      onAdd={addStep}
                      onChange={updateStep}
                      onRemove={removeStep}
                    />

                    <Field data-invalid={submitted && !scenario.when.trim()}>
                      <FieldLabel htmlFor={`${scenario.key}-when`}>
                        When
                      </FieldLabel>
                      <Textarea
                        id={`${scenario.key}-when`}
                        aria-invalid={submitted && !scenario.when.trim()}
                        maxLength={2000}
                        required
                        value={scenario.when}
                        onChange={(event) =>
                          updateScenario(scenarioIndex, (current) => ({
                            ...current,
                            when: event.target.value,
                          }))
                        }
                      />
                    </Field>

                    <ScenarioStepsField
                      label="Then"
                      phase="then"
                      scenario={scenario}
                      scenarioIndex={scenarioIndex}
                      submitted={submitted}
                      onAdd={addStep}
                      onChange={updateStep}
                      onRemove={removeStep}
                    />
                  </FieldGroup>
                </CardContent>
              </Card>
            ))}

            <Alert>
              <AlertDescription>
                Confirming creates a new immutable Story Revision. Existing
                Revisions remain unchanged.
              </AlertDescription>
            </Alert>
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
            <Button disabled={pending || !complete} type="submit">
              {pending
                ? 'Confirming…'
                : `Confirm Revision v${String(story.latestRevisionNumber + 1)}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScenarioStepsField({
  label,
  phase,
  scenario,
  scenarioIndex,
  submitted,
  onAdd,
  onChange,
  onRemove,
}: {
  label: 'Given' | 'Then';
  phase: 'given' | 'then';
  scenario: ScenarioDraft;
  scenarioIndex: number;
  submitted: boolean;
  onAdd: (scenarioIndex: number, phase: 'given' | 'then') => void;
  onChange: (
    scenarioIndex: number,
    phase: 'given' | 'then',
    stepIndex: number,
    step: string,
  ) => void;
  onRemove: (
    scenarioIndex: number,
    phase: 'given' | 'then',
    stepIndex: number,
  ) => void;
}) {
  return (
    <Field>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel>{label}</FieldLabel>
        <Button
          type="button"
          variant="outline"
          onClick={() => onAdd(scenarioIndex, phase)}
        >
          Add {label.toLowerCase()}
        </Button>
      </div>
      <FieldGroup>
        {scenario[phase].map((step, stepIndex) => (
          <Field
            data-invalid={submitted && !step.trim()}
            key={`${scenario.key}-${phase}-${String(stepIndex)}`}
          >
            <FieldLabel
              className="sr-only"
              htmlFor={`${scenario.key}-${phase}-${String(stepIndex)}`}
            >
              {label} {stepIndex + 1}
            </FieldLabel>
            <div className="flex items-start gap-2">
              <Textarea
                id={`${scenario.key}-${phase}-${String(stepIndex)}`}
                aria-invalid={submitted && !step.trim()}
                maxLength={2000}
                required
                value={step}
                onChange={(event) =>
                  onChange(scenarioIndex, phase, stepIndex, event.target.value)
                }
              />
              <Button
                disabled={scenario[phase].length === 1}
                type="button"
                variant="outline"
                onClick={() => onRemove(scenarioIndex, phase, stepIndex)}
              >
                Remove
              </Button>
            </div>
          </Field>
        ))}
      </FieldGroup>
    </Field>
  );
}

function emptyScenario(key: string): ScenarioDraft {
  return {
    key,
    title: '',
    given: [''],
    when: '',
    then: [''],
  };
}

function formComplete(input: {
  title: string;
  problem: string;
  role: string;
  goal: string;
  value: string;
  scenarios: ScenarioDraft[];
}): boolean {
  return (
    [input.title, input.problem, input.role, input.goal, input.value].every(
      (entry) => entry.trim().length > 0,
    ) &&
    input.scenarios.length > 0 &&
    input.scenarios.every(
      (scenario) =>
        scenario.title.trim().length > 0 &&
        scenario.when.trim().length > 0 &&
        scenario.given.length > 0 &&
        scenario.given.every((step) => step.trim().length > 0) &&
        scenario.then.length > 0 &&
        scenario.then.every((step) => step.trim().length > 0),
    )
  );
}

function formatLabel(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
