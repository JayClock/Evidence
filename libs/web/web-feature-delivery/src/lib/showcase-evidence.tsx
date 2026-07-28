import type { ShowcaseResourceData } from '@evidence/api-client';
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
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@evidence/ui';

export function ShowcaseEvidence({
  showcase,
}: {
  showcase: ShowcaseResourceData;
}) {
  return (
    <Tabs className="min-h-0" defaultValue="scenarios">
      <TabsList>
        <TabsTrigger value="scenarios">Scenario 观察</TabsTrigger>
        <TabsTrigger value="risks">Q3 / Q4</TabsTrigger>
        <TabsTrigger value="review">独立 Review</TabsTrigger>
        <TabsTrigger value="authority">锁定 Authority</TabsTrigger>
      </TabsList>
      <TabsContent value="scenarios">
        <ScenarioEvidence showcase={showcase} />
      </TabsContent>
      <TabsContent value="risks">
        <RiskEvidence showcase={showcase} />
      </TabsContent>
      <TabsContent value="review">
        <ReviewEvidence showcase={showcase} />
      </TabsContent>
      <TabsContent value="authority">
        <AuthorityEvidence showcase={showcase} />
      </TabsContent>
    </Tabs>
  );
}

function ScenarioEvidence({ showcase }: { showcase: ShowcaseResourceData }) {
  const observations = new Map(
    showcase.productObservations.map((entry) => [entry.scenarioId, entry]),
  );
  const q2ByScenario = new Map<string, typeof showcase.q2Observations>();
  for (const entry of showcase.q2Observations) {
    for (const scenarioId of entry.scenarioIds) {
      q2ByScenario.set(scenarioId, [
        ...(q2ByScenario.get(scenarioId) ?? []),
        entry,
      ]);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>逐 Scenario 产品观察</CardTitle>
        <CardDescription>
          Q2 只证明可执行行为；观察与价值反馈必须由人记录。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {showcase.storyRevision.scenarios.map((scenario, index) => {
          const observation = observations.get(scenario.id);
          return (
            <section className="flex flex-col gap-3" key={scenario.id}>
              {index > 0 ? <Separator /> : null}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{scenario.reference}</Badge>
                <h3 className="text-sm font-medium">{scenario.title}</h3>
                <Badge variant={observation ? 'default' : 'secondary'}>
                  {observation ? '已人工观察' : '待人工观察'}
                </Badge>
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                <StepList label="Given" values={scenario.given} />
                <StepList label="When" values={[scenario.when]} />
                <StepList label="Then" values={scenario.then} />
              </div>
              <p className="text-xs text-muted-foreground">
                Business data · {scenario.businessData.join(' · ') || '无'}
              </p>
              <div className="flex flex-wrap gap-2">
                {(q2ByScenario.get(scenario.id) ?? []).map((entry) => (
                  <Badge
                    key={entry.id}
                    variant={
                      entry.termination === 'exited' && entry.exitCode === 0
                        ? 'default'
                        : 'secondary'
                    }
                  >
                    {entry.testId} ·{' '}
                    {entry.termination === 'exited' && entry.exitCode === 0
                      ? 'passed'
                      : 'failed'}
                  </Badge>
                ))}
              </div>
              {observation ? (
                <div className="grid gap-3 rounded-lg border p-3 lg:grid-cols-2">
                  <EvidenceText
                    label="观察事实"
                    value={observation.observation}
                  />
                  <EvidenceText
                    label="价值反馈"
                    value={observation.valueFeedback}
                  />
                  <EvidenceList
                    label="实际结果"
                    values={observation.observedOutcomes}
                  />
                  <EvidenceList
                    label="Evidence refs"
                    values={observation.evidenceRefs}
                  />
                </div>
              ) : (
                <Alert>
                  <AlertTitle>不能以全绿测试替代产品观察</AlertTitle>
                  <AlertDescription>
                    接受前必须由领域专家实际观察本 Scenario 的用户可见行为。
                  </AlertDescription>
                </Alert>
              )}
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}

function RiskEvidence({ showcase }: { showcase: ShowcaseResourceData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Q3 / Q4 风险处置</CardTitle>
        <CardDescription>
          not_required 也是显式决定；required 活动必须有最新 passed 评价。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quadrant</TableHead>
              <TableHead>决定</TableHead>
              <TableHead>活动</TableHead>
              <TableHead>理由与评价</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(['Q3', 'Q4'] as const).map((quadrant) => {
              const risk = showcase.riskDecisions.find(
                (candidate) => candidate.quadrant === quadrant,
              );
              return (
                <TableRow key={quadrant}>
                  <TableCell>
                    <Badge variant="outline">{quadrant}</Badge>
                  </TableCell>
                  <TableCell>
                    {risk ? (
                      <Badge>{risk.disposition}</Badge>
                    ) : (
                      <Badge variant="secondary">待决定</Badge>
                    )}
                  </TableCell>
                  <TableCell>{risk?.activities.join(' · ') || '—'}</TableCell>
                  <TableCell>
                    <div className="flex max-w-xl flex-col gap-2">
                      <p className="text-sm">{risk?.reason ?? '尚无理由'}</p>
                      {showcase.evaluations
                        .filter((entry) => entry.quadrant === quadrant)
                        .map((entry) => (
                          <p
                            className="text-xs text-muted-foreground"
                            key={entry.id}
                          >
                            {entry.activity} · {entry.outcome} · {entry.finding}
                          </p>
                        ))}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ReviewEvidence({ showcase }: { showcase: ShowcaseResourceData }) {
  const review = showcase.review;
  if (!review) {
    return (
      <Alert>
        <AlertTitle>独立 Reviewer 尚未运行</AlertTitle>
        <AlertDescription>
          所有 Q2、产品观察与风险评价完成后，Desktop 才能运行只读 Reviewer。
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>独立 Showcase Review</CardTitle>
          <Badge>{review.recommendation}</Badge>
        </div>
        <CardDescription>
          这是建议，不是 Accept / Revise / Reject 决定。
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <EvidenceList label="Observed facts" values={review.observedFacts} />
        <EvidenceList
          label="Product / domain feedback"
          values={review.productDomainFeedback}
        />
        <EvidenceList
          label="Technical quality feedback"
          values={review.technicalQualityFeedback}
        />
        <EvidenceList
          label="Unresolved assumptions"
          values={review.unresolvedAssumptions}
        />
      </CardContent>
    </Card>
  );
}

function AuthorityEvidence({ showcase }: { showcase: ShowcaseResourceData }) {
  const facts = [
    ['Story Revision', showcase.run.storyRevisionSha256],
    ['Approved Plan', showcase.run.approvedTaskingPlanSha256],
    ['Pair Manifest', showcase.run.pairManifestSha256],
    ['Approved commit', showcase.run.approvedCommitSha],
    ['Evidence bundle', showcase.run.evidenceBundleSha256 ?? '尚未生成'],
  ] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle>不可变 Authority</CardTitle>
        <CardDescription>
          Review 与人工决定必须引用同一 evidence bundle。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {facts.map(([label, value]) => (
          <div className="grid gap-1 sm:grid-cols-[10rem_1fr]" key={label}>
            <span className="text-sm font-medium">{label}</span>
            <code className="break-all text-xs text-muted-foreground">
              {value}
            </code>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function StepList({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border p-3">
      <span className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </span>
      {values.map((value) => (
        <p className="text-sm" key={value}>
          {value}
        </p>
      ))}
    </div>
  );
}

function EvidenceText({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </span>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function EvidenceList({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </span>
      {values.length === 0 ? (
        <p className="text-sm text-muted-foreground">无</p>
      ) : null}
      {values.map((value) => (
        <p className="break-words text-sm" key={value}>
          • {value}
        </p>
      ))}
    </div>
  );
}
