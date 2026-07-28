import { useState } from 'react';
import type {
  RecordShowcaseEvaluationInput,
  RecordShowcaseProductObservationInput,
  RecordShowcaseRiskDecisionInput,
  ShowcaseFeedbackTarget,
  ShowcaseNextAction,
  ShowcaseResourceData,
  ShowcaseRiskActivity,
} from '@evidence/api-client';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from '@evidence/ui';

export interface ShowcaseHumanDecision {
  action: 'accept' | 'revise' | 'reject';
  reason: string;
  feedbackTarget: ShowcaseFeedbackTarget | null;
}

interface ShowcaseActionPanelProps {
  showcase: ShowcaseResourceData;
  nextAction: ShowcaseNextAction | null;
  desktopAvailable: boolean;
  pending: boolean;
  onRunLocal: (kind: 'q2' | 'reviewer') => Promise<void>;
  onRecordProductObservation: (
    input: RecordShowcaseProductObservationInput,
  ) => Promise<void>;
  onRecordRiskDecision: (
    input: RecordShowcaseRiskDecisionInput,
  ) => Promise<void>;
  onRecordEvaluation: (input: RecordShowcaseEvaluationInput) => Promise<void>;
  onDecide: (decision: ShowcaseHumanDecision) => Promise<void>;
}

export function ShowcaseActionPanel(props: ShowcaseActionPanelProps) {
  const { nextAction } = props;
  if (!nextAction) {
    return (
      <Alert>
        <AlertTitle>Showcase 已完成</AlertTitle>
        <AlertDescription>
          此 Attempt 没有可执行的下一步；历史证据保持只读。
        </AlertDescription>
      </Alert>
    );
  }
  switch (nextAction.kind) {
    case 'execute_q2':
      return <LocalAction kind="q2" props={props} />;
    case 'observe_scenario':
      return <ObservationForm action={nextAction} props={props} />;
    case 'decide_risk':
      return <RiskDecisionForm action={nextAction} props={props} />;
    case 'evaluate_risk':
      return <EvaluationForm action={nextAction} props={props} />;
    case 'run_reviewer':
      return <LocalAction kind="reviewer" props={props} />;
    case 'await_human':
    case 'resolve_failure':
      return <HumanDecisionForm action={nextAction} props={props} />;
  }
}

function LocalAction({
  kind,
  props,
}: {
  kind: 'q2' | 'reviewer';
  props: ShowcaseActionPanelProps;
}) {
  const action = props.nextAction;
  if (!action) return null;
  const q2 = action.kind === 'execute_q2';
  return (
    <div className="flex flex-col gap-3">
      <Badge className="w-fit" variant="outline">
        {q2 ? 'Q2 fresh rerun' : 'Independent review'}
      </Badge>
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">
          {q2
            ? `执行 ${action.kind === 'execute_q2' ? action.testId : ''}`
            : '运行只读 Reviewer'}
        </h3>
        <p className="text-sm text-muted-foreground">
          {q2 && action.kind === 'execute_q2'
            ? `${action.command} · timeout ${String(action.timeoutMs)} ms`
            : 'Reviewer 只读取锁定代码与 bounded Server evidence，并提交一次结构化建议。'}
        </p>
      </div>
      <Button
        disabled={props.pending || !props.desktopAvailable}
        onClick={() => void props.onRunLocal(kind)}
        type="button"
      >
        {props.pending ? <Spinner data-icon="inline-start" /> : null}
        {props.pending
          ? '正在运行…'
          : q2
            ? '在 Desktop 重跑 Q2'
            : '运行独立 Reviewer'}
      </Button>
      {!props.desktopAvailable ? (
        <Alert>
          <AlertTitle>需要 Evidence Desktop</AlertTitle>
          <AlertDescription>
            Browser 不执行仓库命令，也不运行 Pi Reviewer。
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function ObservationForm({
  action,
  props,
}: {
  action: Extract<ShowcaseNextAction, { kind: 'observe_scenario' }>;
  props: ShowcaseActionPanelProps;
}) {
  const scenario = props.showcase.storyRevision.scenarios.find(
    (entry) => entry.id === action.scenarioId,
  );
  const [outcomes, setOutcomes] = useState(
    () => scenario?.then.map(() => '') ?? [''],
  );
  const [observation, setObservation] = useState('');
  const [valueFeedback, setValueFeedback] = useState('');
  const [evidenceRefs, setEvidenceRefs] = useState('');
  const refs = lines(evidenceRefs);
  const valid =
    outcomes.length > 0 &&
    outcomes.every(Boolean) &&
    Boolean(observation.trim()) &&
    Boolean(valueFeedback.trim()) &&
    refs.length > 0;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        void props.onRecordProductObservation({
          expectedShowcaseVersion: action.expectedShowcaseVersion,
          scenarioId: action.scenarioId,
          observedOutcomes: outcomes.map((value) => value.trim()),
          observation: observation.trim(),
          valueFeedback: valueFeedback.trim(),
          evidenceRefs: refs,
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <Badge className="w-fit" variant="outline">
          {action.scenarioReference}
        </Badge>
        <h3 className="text-sm font-medium">
          {scenario?.title ?? '人工观察 Scenario'}
        </h3>
        <p className="text-sm text-muted-foreground">
          记录实际看到的行为，不要复述测试结果。
        </p>
      </div>
      <FieldGroup>
        {(scenario?.then ?? ['实际结果']).map((expected, index) => (
          <Field
            data-invalid={!outcomes[index]?.trim()}
            key={`${String(index)}:${expected}`}
          >
            <FieldLabel htmlFor={`showcase-outcome-${String(index)}`}>
              Then {String(index + 1)} 的实际结果
            </FieldLabel>
            <FieldDescription>{expected}</FieldDescription>
            <Textarea
              aria-invalid={!outcomes[index]?.trim()}
              id={`showcase-outcome-${String(index)}`}
              onChange={(event) =>
                setOutcomes((current) =>
                  current.map((value, candidate) =>
                    candidate === index ? event.target.value : value,
                  ),
                )
              }
              value={outcomes[index] ?? ''}
            />
          </Field>
        ))}
        <Field data-invalid={!observation.trim()}>
          <FieldLabel htmlFor="showcase-observation">观察事实</FieldLabel>
          <Textarea
            id="showcase-observation"
            onChange={(event) => setObservation(event.target.value)}
            value={observation}
          />
        </Field>
        <Field data-invalid={!valueFeedback.trim()}>
          <FieldLabel htmlFor="showcase-value-feedback">价值反馈</FieldLabel>
          <FieldDescription>
            这是否解决了 Story 声明的问题？价值是否可见？
          </FieldDescription>
          <Textarea
            id="showcase-value-feedback"
            onChange={(event) => setValueFeedback(event.target.value)}
            value={valueFeedback}
          />
        </Field>
        <Field data-invalid={refs.length === 0}>
          <FieldLabel htmlFor="showcase-evidence-refs">
            Evidence refs
          </FieldLabel>
          <FieldDescription>
            每行一个可审计引用；不得提交 file: URL 或绝对路径。
          </FieldDescription>
          <Textarea
            id="showcase-evidence-refs"
            onChange={(event) => setEvidenceRefs(event.target.value)}
            placeholder="例如：screen:scenario-1-success"
            value={evidenceRefs}
          />
        </Field>
      </FieldGroup>
      <Button disabled={props.pending || !valid} type="submit">
        {props.pending ? <Spinner data-icon="inline-start" /> : null}
        记录人工产品观察
      </Button>
    </form>
  );
}

function RiskDecisionForm({
  action,
  props,
}: {
  action: Extract<ShowcaseNextAction, { kind: 'decide_risk' }>;
  props: ShowcaseActionPanelProps;
}) {
  const [disposition, setDisposition] = useState<'required' | 'not_required'>(
    'required',
  );
  const [activities, setActivities] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const options = action.quadrant === 'Q3' ? q3Activities : q4Activities;
  const valid =
    Boolean(reason.trim()) &&
    (disposition === 'not_required' || activities.length > 0);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        void props.onRecordRiskDecision({
          expectedShowcaseVersion: action.expectedShowcaseVersion,
          quadrant: action.quadrant,
          disposition,
          activities:
            disposition === 'required'
              ? (activities as ShowcaseRiskActivity[])
              : [],
          reason: reason.trim(),
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <Badge className="w-fit" variant="outline">
          {action.quadrant}
        </Badge>
        <h3 className="text-sm font-medium">显式决定风险评价范围</h3>
        <p className="text-sm text-muted-foreground">
          required 选择活动；not_required 必须说明为何本 Story 无需此类评价。
        </p>
      </div>
      <FieldSet>
        <FieldLegend>处置</FieldLegend>
        <ToggleGroup
          onValueChange={(value) => {
            if (value === 'required' || value === 'not_required')
              setDisposition(value);
          }}
          type="single"
          value={disposition}
          variant="outline"
        >
          <ToggleGroupItem value="required">需要评价</ToggleGroupItem>
          <ToggleGroupItem value="not_required">不需要</ToggleGroupItem>
        </ToggleGroup>
      </FieldSet>
      {disposition === 'required' ? (
        <FieldSet>
          <FieldLegend>活动</FieldLegend>
          <FieldDescription>
            至少选择一项；other 仍需在理由中说明具体活动。
          </FieldDescription>
          <ToggleGroup
            className="flex-wrap justify-start"
            onValueChange={setActivities}
            type="multiple"
            value={activities}
            variant="outline"
          >
            {options.map((activity) => (
              <ToggleGroupItem key={activity} value={activity}>
                {riskActivityLabel[activity]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FieldSet>
      ) : null}
      <Field data-invalid={!reason.trim()}>
        <FieldLabel htmlFor={`showcase-${action.quadrant}-reason`}>
          决定理由
        </FieldLabel>
        <Textarea
          aria-invalid={!reason.trim()}
          id={`showcase-${action.quadrant}-reason`}
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
      </Field>
      <Button disabled={props.pending || !valid} type="submit">
        {props.pending ? <Spinner data-icon="inline-start" /> : null}记录{' '}
        {action.quadrant} 决定
      </Button>
    </form>
  );
}

function EvaluationForm({
  action,
  props,
}: {
  action: Extract<ShowcaseNextAction, { kind: 'evaluate_risk' }>;
  props: ShowcaseActionPanelProps;
}) {
  const [outcome, setOutcome] = useState<'passed' | 'concern'>('passed');
  const [finding, setFinding] = useState('');
  const [evidenceRefs, setEvidenceRefs] = useState('');
  const refs = lines(evidenceRefs);
  const valid = Boolean(finding.trim()) && refs.length > 0;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        void props.onRecordEvaluation({
          expectedShowcaseVersion: action.expectedShowcaseVersion,
          quadrant: action.quadrant,
          activity: action.activity,
          outcome,
          finding: finding.trim(),
          evidenceRefs: refs,
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <Badge className="w-fit" variant="outline">
          {action.quadrant} · {riskActivityLabel[action.activity]}
        </Badge>
        <h3 className="text-sm font-medium">记录活动评价</h3>
        <p className="text-sm text-muted-foreground">
          concern 会阻止接受，并要求人工选择 revise 或 reject。
        </p>
      </div>
      <FieldSet>
        <FieldLegend>结果</FieldLegend>
        <ToggleGroup
          onValueChange={(value) => {
            if (value === 'passed' || value === 'concern') setOutcome(value);
          }}
          type="single"
          value={outcome}
          variant="outline"
        >
          <ToggleGroupItem value="passed">Passed</ToggleGroupItem>
          <ToggleGroupItem value="concern">Concern</ToggleGroupItem>
        </ToggleGroup>
      </FieldSet>
      <FieldGroup>
        <Field data-invalid={!finding.trim()}>
          <FieldLabel htmlFor="showcase-risk-finding">评价发现</FieldLabel>
          <Textarea
            id="showcase-risk-finding"
            onChange={(event) => setFinding(event.target.value)}
            value={finding}
          />
        </Field>
        <Field data-invalid={refs.length === 0}>
          <FieldLabel htmlFor="showcase-risk-refs">Evidence refs</FieldLabel>
          <FieldDescription>每行一个 bounded、可审计引用。</FieldDescription>
          <Textarea
            id="showcase-risk-refs"
            onChange={(event) => setEvidenceRefs(event.target.value)}
            value={evidenceRefs}
          />
        </Field>
      </FieldGroup>
      <Button disabled={props.pending || !valid} type="submit">
        {props.pending ? <Spinner data-icon="inline-start" /> : null}记录评价
      </Button>
    </form>
  );
}

function HumanDecisionForm({
  action,
  props,
}: {
  action: Extract<
    ShowcaseNextAction,
    { kind: 'await_human' | 'resolve_failure' }
  >;
  props: ShowcaseActionPanelProps;
}) {
  const allowed =
    action.kind === 'await_human'
      ? (['accept', 'revise', 'reject'] as const)
      : action.allowedActions;
  const [decision, setDecision] = useState<'accept' | 'revise' | 'reject'>(
    allowed[0],
  );
  const [feedbackTarget, setFeedbackTarget] =
    useState<ShowcaseFeedbackTarget | null>(null);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const valid =
    Boolean(reason.trim()) &&
    confirmed &&
    (decision !== 'revise' || feedbackTarget !== null);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        void props.onDecide({
          action: decision,
          reason: reason.trim(),
          feedbackTarget: decision === 'revise' ? feedbackTarget : null,
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <Badge
          className="w-fit"
          variant={action.kind === 'resolve_failure' ? 'secondary' : 'outline'}
        >
          {action.kind === 'resolve_failure'
            ? 'Failure resolution'
            : 'Human value decision'}
        </Badge>
        <h3 className="text-sm font-medium">
          {action.kind === 'resolve_failure'
            ? '处理失败或 concern'
            : '作出 Story 级产品决定'}
        </h3>
        <p className="text-sm text-muted-foreground">
          Accept 进入 Respond；Revise 按知识缺口路由；Reject 停止 Iteration。
        </p>
      </div>
      <FieldSet>
        <FieldLegend>决定</FieldLegend>
        <ToggleGroup
          onValueChange={(value) => {
            if (
              value === 'accept' ||
              value === 'revise' ||
              value === 'reject'
            ) {
              setDecision(value);
              if (value !== 'revise') setFeedbackTarget(null);
              setConfirmed(false);
            }
          }}
          type="single"
          value={decision}
          variant="outline"
        >
          {allowed.includes('accept' as never) ? (
            <ToggleGroupItem value="accept">Accept</ToggleGroupItem>
          ) : null}
          {allowed.includes('revise') ? (
            <ToggleGroupItem value="revise">Revise</ToggleGroupItem>
          ) : null}
          {allowed.includes('reject') ? (
            <ToggleGroupItem value="reject">Reject</ToggleGroupItem>
          ) : null}
        </ToggleGroup>
      </FieldSet>
      {decision === 'revise' ? (
        <Field data-invalid={!feedbackTarget}>
          <FieldLabel htmlFor="showcase-feedback-target">知识缺口</FieldLabel>
          <FieldDescription>
            实现级 test / implementation / refactor 路由将在可恢复 worktree
            Controller 落地后开放。
          </FieldDescription>
          <Select
            onValueChange={(value) =>
              setFeedbackTarget(value as ShowcaseFeedbackTarget)
            }
            value={feedbackTarget ?? undefined}
          >
            <SelectTrigger className="w-full" id="showcase-feedback-target">
              <SelectValue placeholder="选择反馈目标" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {feedbackTargets.map((target) => (
                  <SelectItem key={target} value={target}>
                    {feedbackTargetLabel[target]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      <Field data-invalid={!reason.trim()}>
        <FieldLabel htmlFor="showcase-decision-reason">决定理由</FieldLabel>
        <FieldDescription>
          说明价值判断或为何需要路由；该事实将 append-only 保存。
        </FieldDescription>
        <Textarea
          aria-invalid={!reason.trim()}
          id="showcase-decision-reason"
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
      </Field>
      <Field orientation="horizontal">
        <Checkbox
          checked={confirmed}
          id="showcase-human-authority"
          onCheckedChange={(value) => setConfirmed(value === true)}
        />
        <FieldContent>
          <FieldLabel htmlFor="showcase-human-authority">
            我确认这是人工产品决定
          </FieldLabel>
          <FieldDescription>
            独立 Reviewer 的 recommendation 仅供参考，不能代替此确认。
          </FieldDescription>
        </FieldContent>
      </Field>
      <Button
        disabled={props.pending || !valid}
        type="submit"
        variant={decision === 'reject' ? 'destructive' : 'default'}
      >
        {props.pending ? <Spinner data-icon="inline-start" /> : null}确认{' '}
        {decision}
      </Button>
    </form>
  );
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const q3Activities = [
  'exploratory',
  'usability',
  'accessibility',
  'compatibility',
  'other',
] as const;
const q4Activities = [
  'performance',
  'security',
  'reliability',
  'operability',
  'other',
] as const;

const riskActivityLabel: Record<ShowcaseRiskActivity, string> = {
  exploratory: 'Exploratory',
  usability: 'Usability',
  accessibility: 'Accessibility',
  compatibility: 'Compatibility',
  performance: 'Performance',
  security: 'Security',
  reliability: 'Reliability',
  operability: 'Operability',
  other: 'Other',
};

const feedbackTargets = [
  'problem',
  'story',
  'business_knowledge',
  'scenario',
  'model',
  'modeling_method',
  'architecture',
  'test_strategy',
  'test_process',
  'value_validation',
  'showcase_setup',
] as const satisfies readonly ShowcaseFeedbackTarget[];

const feedbackTargetLabel: Record<(typeof feedbackTargets)[number], string> = {
  problem: 'Problem boundary → Kickoff',
  story: 'Story claim → Kickoff',
  business_knowledge: 'Business knowledge → Understand',
  scenario: 'Scenario → Understand / TQA',
  model: 'Domain model → Understand / Modeling',
  modeling_method: 'Modeling method → Understand / Modeling',
  architecture: 'Architecture → Tasking',
  test_strategy: 'Test strategy → Tasking',
  test_process: 'Test process → Tasking',
  value_validation: 'Value validation → new Showcase Attempt',
  showcase_setup: 'Showcase setup → new Showcase Attempt',
};
