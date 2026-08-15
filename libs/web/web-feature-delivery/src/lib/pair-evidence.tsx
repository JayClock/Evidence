import type { PairLocalReview, PairResource } from '@evidence/api-client';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Progress,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@evidence/ui';
import { shortHash } from './delivery-authority-progress';
import {
  commandObservationDetail,
  nextActionTitle,
  pairCheckpointLabel,
  pairDecisionLabel,
  pairStatusLabel,
  pairStepIndex,
  reviewMatchesManifest,
} from './pair-workbench-format';

export function PairAuthorityProgress({
  pair,
}: {
  pair: PairResource['data'];
}) {
  const steps = [
    ['Approved Plan', '输入已锁定'],
    ['逐 TEST Pair', `${pair.run.completedTestIds.length} TEST complete`],
    ['Refactor', `${pair.run.completedStepKeys.length} step complete`],
    ['质量门', pairCheckpointLabel(pair.run.checkpoint)],
    ['Story Diff 审查', '人工权威'],
    ['本地 Commit', 'hash 校验后创建'],
    ['Pair Approved', '不 merge / push'],
  ] as const;
  const current = pairStepIndex(pair);
  return (
    <div className="h-[3.375rem] shrink-0 overflow-x-auto px-4 pb-[0.4375rem]">
      <ol
        aria-label="Pair 权威阶段"
        className="grid h-[2.9375rem] min-w-[56rem] grid-cols-7 overflow-hidden rounded-lg border bg-card"
      >
        {steps.map(([label, detail], index) => {
          const state =
            index < current
              ? 'done'
              : index === current
                ? 'current'
                : 'upcoming';
          return (
            <li
              className="flex min-w-0 items-center gap-2 border-r px-2 last:border-r-0 data-[state=current]:bg-ev-brand-soft data-[state=done]:bg-secondary"
              data-state={state}
              key={label}
            >
              <Badge
                variant={
                  state === 'current'
                    ? 'default'
                    : state === 'done'
                      ? 'secondary'
                      : 'outline'
                }
              >
                {state === 'done' ? '✓' : index + 1}
              </Badge>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-xs font-medium">{label}</span>
                <span className="truncate text-[0.6875rem] text-muted-foreground">
                  {detail}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function PairRunNavigation({ pair }: { pair: PairResource['data'] }) {
  const tests = pair.approvedPlan.plan?.tests ?? [];
  const completed = new Set(pair.run.completedTestIds);
  const progress = tests.length
    ? Math.round((completed.size / tests.length) * 100)
    : 0;
  const gateObservations = pair.commandObservations.filter(
    ({ stage }) => stage === 'quality_gate',
  );

  return (
    <nav
      aria-label="Pair 交付运行"
      className="flex min-h-0 flex-col border-b bg-ev-soft p-3 xl:border-r xl:border-b-0"
    >
      <div className="shrink-0">
        <p className="font-mono text-xs font-semibold">{pair.run.reference}</p>
        <p className="mt-1 text-[0.6875rem] text-muted-foreground">
          交付运行 · {pairStatusLabel(pair.run.status)}
        </p>
        <Progress aria-label="测试执行进度" className="mt-3" value={progress} />
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold">测试执行</h2>
          <span className="font-mono text-[0.6875rem] text-muted-foreground">
            {completed.size} / {tests.length}
          </span>
        </div>
        <ol className="mt-2 flex flex-col gap-1.5">
          {tests.map((test) => {
            const done = completed.has(test.id);
            return (
              <li
                className="flex h-[2.625rem] items-center gap-2 rounded-md border bg-card px-2 data-[done=true]:border-ev-brand data-[done=true]:bg-ev-brand-soft"
                data-done={done}
                key={test.id}
              >
                <code className="shrink-0 text-[0.6875rem] font-semibold">
                  {test.id}
                </code>
                <p className="min-w-0 flex-1 truncate text-[0.6875rem] text-muted-foreground">
                  {test.intent}
                </p>
                <Badge variant={done ? 'default' : 'outline'}>
                  {done ? '完成' : '等待'}
                </Badge>
              </li>
            );
          })}
        </ol>

        <h2 className="mt-4 text-xs font-semibold">质量门</h2>
        {gateObservations.length ? (
          <ul className="mt-2 flex flex-col gap-1.5">
            {gateObservations.map((observation) => (
              <li
                className="flex h-7 items-center justify-between gap-2 rounded-md border bg-card px-2"
                key={observation.id}
              >
                <span className="truncate text-[0.6875rem]">
                  {observation.command}
                </span>
                <Badge variant="outline">
                  {observation.exitCode === 0 ? '通过' : '失败'}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[0.6875rem] text-muted-foreground">
            尚无质量门 observation。
          </p>
        )}
      </div>
    </nav>
  );
}

export function ServerActionStrip({ pair }: { pair: PairResource['data'] }) {
  const action = pair.nextAction;
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>SERVER 唯一 NEXT ACTION</Badge>
          <Badge variant="outline">{action?.kind ?? 'none'}</Badge>
        </div>
        <CardTitle>{nextActionTitle(action)}</CardTitle>
        <CardDescription>
          {action
            ? `${action.actionId} · expected Pair version ${action.expectedPairVersion}`
            : 'Pair 已停止，没有下一自动动作。'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 text-xs sm:grid-cols-4">
        <EvidenceFact
          label="Story Revision"
          value={shortHash(pair.run.storyRevisionSha256)}
        />
        <EvidenceFact
          label="Approved Plan"
          value={shortHash(pair.run.approvedTaskingPlanSha256)}
        />
        <EvidenceFact
          label="Agent calls"
          value={`${pair.run.budgetUsage.agentCalls} / ${pair.run.executionBudget.maxAgentCalls}`}
        />
        <EvidenceFact
          label="Checkpoints"
          value={`${pair.run.budgetUsage.checkpoints} / ${pair.run.executionBudget.maxCheckpoints}`}
        />
      </CardContent>
    </Card>
  );
}

export function PairEvidenceTabs({
  pair,
  review,
  tab,
  onTabChange,
}: {
  pair: PairResource['data'];
  review: PairLocalReview | null;
  tab: string;
  onTabChange: (tab: string) => void;
}) {
  const timelineObservations = pair.commandObservations.filter(
    ({ stage }) => stage === 'red' || stage === 'green',
  );
  const gateObservations = pair.commandObservations.filter(
    ({ stage }) => stage === 'refactor' || stage === 'quality_gate',
  );
  const refactors = pair.driverAttempts.filter(
    ({ role }) => role === 'refactor',
  );
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Pair 执行与审查证据</CardTitle>
        <CardDescription>
          界面只读取 Server bounded evidence；本地 Diff 仅由 Desktop capability
          提供。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs onValueChange={onTabChange} value={tab}>
          <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="timeline">逐 TEST 证据</TabsTrigger>
            <TabsTrigger value="gates">Refactor 与质量门</TabsTrigger>
            <TabsTrigger value="diff">本地 Story Diff</TabsTrigger>
            <TabsTrigger value="locks">锁定与 Manifest</TabsTrigger>
          </TabsList>
          <TabsContent className="mt-4" value="timeline">
            <div className="flex flex-col gap-5">
              <EvidenceList
                empty="尚无 Driver attempt。"
                heading="短生命周期 Driver attempts"
                items={pair.driverAttempts
                  .filter(({ role }) => role !== 'refactor')
                  .map((attempt) => ({
                    id: attempt.id,
                    badges: [
                      attempt.testId ?? 'no-test',
                      attempt.role,
                      attempt.mode,
                    ],
                    title: attempt.summary,
                    detail: `${attempt.changedPaths.length} relative paths · diff ${shortHash(attempt.diffSha256)}`,
                  }))}
              />
              <EvidenceList
                empty="尚无 Red / Green command observation。"
                heading="锁定 Red / Green observations"
                items={timelineObservations.map((observation) => ({
                  id: observation.id,
                  badges: [
                    observation.testId ?? 'no-test',
                    observation.stage,
                    observation.termination,
                  ],
                  title: observation.command,
                  detail: commandObservationDetail(observation),
                }))}
              />
              <EvidenceList
                empty="尚无独立 Red Review。"
                heading="Independent Red Reviews"
                items={pair.redReviews.map((reviewItem) => ({
                  id: reviewItem.id,
                  badges: [
                    reviewItem.classification,
                    reviewItem.accepted ? 'accepted' : 'rejected',
                  ],
                  title: reviewItem.reason,
                  detail: `Observation ${reviewItem.observationId} · ${shortHash(reviewItem.recordSha256)}`,
                }))}
              />
            </div>
          </TabsContent>
          <TabsContent className="mt-4" value="gates">
            <Alert>
              <AlertDescription>
                每个 process step 恰好一个 Refactor 或显式 no-op；Controller
                只能运行 Approved Plan 已物化并验证的命令，没有通用 shell。
              </AlertDescription>
            </Alert>
            <div className="mt-4 flex flex-col gap-5">
              <EvidenceList
                empty="尚无 Refactor checkpoint。"
                heading="Refactor checkpoints"
                items={refactors.map((attempt) => ({
                  id: attempt.id,
                  badges: [attempt.processId ?? 'process', attempt.mode],
                  title: attempt.summary,
                  detail: `${attempt.changedPaths.length} relative paths · diff ${shortHash(attempt.diffSha256)}`,
                }))}
              />
              <EvidenceList
                empty="尚无 Refactor 或质量门 observation。"
                heading="最终锁定质量门"
                items={gateObservations.map((observation) => ({
                  id: observation.id,
                  badges: [
                    observation.stage,
                    observation.termination,
                    `exit ${observation.exitCode ?? 'none'}`,
                  ],
                  title: observation.command,
                  detail: commandObservationDetail(observation),
                }))}
              />
            </div>
          </TabsContent>
          <TabsContent className="mt-4" value="diff">
            <LocalDiffPanel manifest={pair.manifest} review={review} />
          </TabsContent>
          <TabsContent className="mt-4" value="locks">
            <LockEvidence pair={pair} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export function PairReviewWorkspace({
  pair,
  review,
}: {
  pair: PairResource['data'];
  review: PairLocalReview | null;
}) {
  if (!review) {
    return (
      <Empty className="h-full min-h-64 rounded-none border-0">
        <EmptyHeader>
          <EmptyTitle>尚未加载本地 Story Diff</EmptyTitle>
          <EmptyDescription>
            在右侧从 Evidence Desktop 加载并校验完整 Diff；正文不会上传 Server。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const validation = pair.commandObservations.filter(
    ({ stage }) => stage === 'refactor' || stage === 'quality_gate',
  );
  const matches = Boolean(
    pair.manifest && reviewMatchesManifest(review, pair.manifest),
  );
  return (
    <section
      aria-label="本地 Story Diff 审查"
      className="flex h-full min-h-0 flex-col bg-card"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <span className="min-w-0 flex-1 truncate font-mono text-xs">
          {review.changedPaths[0] ?? 'Story Diff'}
        </span>
        <Badge variant={matches ? 'default' : 'destructive'}>
          {matches ? 'Manifest 已匹配' : 'Hash 不匹配'}
        </Badge>
        <span className="font-mono text-[0.6875rem] text-muted-foreground">
          {review.changedFileCount} files
        </span>
      </header>
      <div className="flex h-[2.125rem] shrink-0 items-center gap-4 overflow-x-auto border-b px-3">
        {review.changedPaths.map((path, index) => (
          <span
            className="shrink-0 font-mono text-[0.6875rem] text-muted-foreground data-[active=true]:font-semibold data-[active=true]:text-foreground"
            data-active={index === 0}
            key={path}
          >
            {path}
          </span>
        ))}
      </div>
      <pre className="min-h-0 flex-1 overflow-auto bg-card p-3 font-mono text-xs leading-6 whitespace-pre">
        {review.diff}
      </pre>
      <div className="h-[7.25rem] shrink-0 border-t bg-secondary">
        <div className="flex h-8 items-center justify-between border-b px-2.5">
          <h3 className="text-xs font-semibold">验证输出</h3>
          <span className="font-mono text-[0.6875rem] text-muted-foreground">
            {validation.length} observations
          </span>
        </div>
        <div className="flex h-[5.25rem] flex-col gap-1 overflow-y-auto px-2.5 py-2 font-mono text-[0.6875rem]">
          {validation.length ? (
            validation.map((observation) => (
              <p className="truncate" key={observation.id}>
                {observation.exitCode === 0 ? '✓' : '×'} {observation.command}
              </p>
            ))
          ) : (
            <p className="text-muted-foreground">
              Manifest 已锁定全部质量门结果。
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function PairFacts({ pair }: { pair: PairResource['data'] }) {
  const facts = [
    [
      'Iteration / Story',
      `${pair.iteration.reference} · ${pair.story.reference}`,
    ],
    ['Story Revision', shortHash(pair.run.storyRevisionSha256)],
    ['Approved Plan', shortHash(pair.run.approvedTaskingPlanSha256)],
    ['Base commit', shortHash(pair.run.baseCommitSha)],
    ['Pair checkpoint', `${pair.run.checkpoint} · v${pair.run.version}`],
    [
      'Manifest',
      pair.manifest ? shortHash(pair.manifest.contentSha256) : 'none',
    ],
  ];
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">始终锁定的权威事实</h3>
      <dl className="flex flex-col gap-2 text-xs">
        {facts.map(([label, value]) => (
          <div
            className="flex items-start justify-between gap-3 rounded-lg border p-2.5"
            key={label}
          >
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="max-w-[13rem] break-all text-right font-mono">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function LocalDiffPanel({
  manifest,
  review,
}: {
  manifest: PairResource['data']['manifest'];
  review: PairLocalReview | null;
}) {
  if (!review) {
    return (
      <Empty className="min-h-64 rounded-lg border border-dashed">
        <EmptyHeader>
          <EmptyTitle>尚未加载本地 Story Diff</EmptyTitle>
          <EmptyDescription>
            只有 Desktop 可以校验 Manifest 并将完整 Diff 提供给本地 renderer；
            Diff 正文不会上传 Server。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  const matches = Boolean(manifest && reviewMatchesManifest(review, manifest));
  return (
    <div className="flex flex-col gap-3">
      <Alert variant={matches ? 'default' : 'destructive'}>
        <AlertTitle>
          {matches ? 'Manifest 与本地 Diff hash 已匹配' : '本地证据已变化'}
        </AlertTitle>
        <AlertDescription>
          {review.changedFileCount} 个 relative changed paths · diff{' '}
          {shortHash(review.diffSha256)}
        </AlertDescription>
      </Alert>
      <ul className="flex flex-wrap gap-2">
        {review.changedPaths.map((path) => (
          <li key={path}>
            <Badge variant="outline">{path}</Badge>
          </li>
        ))}
      </ul>
      <pre className="max-h-[40rem] overflow-auto rounded-lg border bg-muted p-3 text-xs whitespace-pre">
        {review.diff}
      </pre>
    </div>
  );
}

function LockEvidence({ pair }: { pair: PairResource['data'] }) {
  const manifest = pair.manifest;
  const facts = [
    ['Story Revision SHA-256', shortHash(pair.run.storyRevisionSha256)],
    ['Approved Plan SHA-256', shortHash(pair.run.approvedTaskingPlanSha256)],
    [
      'Git baseline / branch',
      `${shortHash(pair.run.baseCommitSha)} · ${pair.run.branchName}`,
    ],
    [
      'Pair budget policy',
      `${pair.run.executionBudget.policyId} v${pair.run.executionBudget.policyVersion} · agent ${pair.run.executionBudget.maxAgentCalls} · checkpoint ${pair.run.executionBudget.maxCheckpoints}`,
    ],
    [
      'Retry / no progress',
      `${pair.run.budgetUsage.repeatedFingerprintCount} / ${pair.run.budgetUsage.noProgressCheckpoints}`,
    ],
    [
      'Local recovery checkpoint',
      `Pair v${pair.run.version} · ${pairCheckpointLabel(pair.run.checkpoint)}`,
    ],
  ];
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-3 sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <EvidenceFact key={label} label={label} value={value} />
        ))}
      </dl>
      {manifest ? (
        <Alert>
          <AlertTitle>
            Execution Manifest · {shortHash(manifest.contentSha256)}
          </AlertTitle>
          <AlertDescription>
            Final diff {shortHash(manifest.finalDiffSha256)} ·{' '}
            {manifest.changedPaths.length} 个 relative paths · TEST{' '}
            {manifest.completedTestIds.length} · step{' '}
            {manifest.completedStepKeys.length}。
          </AlertDescription>
        </Alert>
      ) : null}
      {pair.decisions.length ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">
            append-only Pair coding decisions
          </h3>
          {pair.decisions.map((decision) => (
            <div className="rounded-lg border p-3" key={decision.id}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{pairDecisionLabel(decision.action)}</Badge>
                <span className="font-mono text-xs text-muted-foreground">
                  {shortHash(decision.contentSha256)}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {decision.reason}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EvidenceList({
  heading,
  empty,
  items,
}: {
  heading: string;
  empty: string;
  items: Array<{ id: string; badges: string[]; title: string; detail: string }>;
}) {
  return (
    <section>
      <h3 className="font-medium">{heading}</h3>
      {!items.length ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-3">
          {items.map((item) => (
            <li className="rounded-lg border p-3" key={item.id}>
              <div className="flex flex-wrap gap-2">
                {item.badges.map((badge) => (
                  <Badge key={badge} variant="outline">
                    {pairStatusLabel(badge)}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-sm font-medium">{item.title}</p>
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

function EvidenceFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-background p-2.5">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 break-all font-mono">{value}</p>
    </div>
  );
}
