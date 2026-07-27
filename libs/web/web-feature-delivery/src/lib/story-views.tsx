import { useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  State,
  StoryCollectionResource,
  StoryRevisionCollectionResource,
  StoryRevisionResource,
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@evidence/ui';
import { DeliveryPagination } from './delivery-pagination';

export function StoryCollectionView({
  resourceState,
}: {
  resourceState: State<StoryCollectionResource>;
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
      setPageError(errorMessage(caught, '无法载入 Story 页面。'));
    } finally {
      setPagePending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="gap-2">
        <CardTitle aria-level={1} role="heading">
          权威 Story
        </CardTitle>
        <CardDescription>
          这里只展示经人工 Kickoff confirm 创建的 Story identity
          及其不可变修订历史。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Pair 必须锁定人工批准的 Tasking Plan 与精确 Story Revision。
          </p>
          <Badge variant="secondary">
            共 {collectionState.data.page.totalElements} 张
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
              <EmptyTitle>尚无权威 Story</EmptyTitle>
              <EmptyDescription>
                人工 confirm 一份 Frozen Kickoff Proposal 后才会创建 US-001。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Story</TableHead>
                  <TableHead>Iteration</TableHead>
                  <TableHead>当前阶段</TableHead>
                  <TableHead>Latest Revision</TableHead>
                  <TableHead>更新时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {collectionState.collection.map((storyState) => {
                  const story = storyState.data;
                  const href = storyState.getLink('self')?.href;
                  return (
                    <TableRow key={story.id}>
                      <TableCell className="min-w-56">
                        <p className="font-medium">{story.title}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {story.reference}
                        </p>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {story.iterationReference}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {workflowStageLabel(story.iterationStage)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="tabular-nums">
                          v{story.latestRevisionNumber}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {story.latestScenarioCount} 个 Scenario
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(story.updatedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {href ? (
                          <Button asChild size="sm" variant="outline">
                            <Link to={href}>打开</Link>
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
          label="Story 分页"
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

export function StoryRevisionCollectionView({
  resourceState,
}: {
  resourceState: State<StoryRevisionCollectionResource>;
}) {
  const [pageState, setPageState] = useState(resourceState);
  const [pagePending, setPagePending] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const navigatePage = async (relation: 'prev' | 'next') => {
    if (!pageState.getLink(relation) || pagePending) return;
    setPagePending(true);
    setPageError(null);
    try {
      setPageState(await pageState.follow(relation).refresh());
    } catch (caught) {
      setPageError(errorMessage(caught, '无法载入 Story Revision 页面。'));
    } finally {
      setPagePending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="gap-2">
        <CardTitle aria-level={1} role="heading">
          Story 修订历史
        </CardTitle>
        <CardDescription>
          保留每个不可变快照，使 Scenario、Tasking 与 Pair 权威可复现。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pageError ? (
          <Alert className="mb-3" variant="destructive">
            <AlertDescription>{pageError}</AlertDescription>
          </Alert>
        ) : null}
        {pageState.collection.length === 0 ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyTitle>未找到 Story Revision</EmptyTitle>
              <EmptyDescription>
                人工 confirm 创建 Story 时必定同时形成 baseline Revision v1。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Revision</TableHead>
                  <TableHead>标题</TableHead>
                  <TableHead>Scenario</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead>内容哈希</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageState.collection.map((revisionState) => {
                  const revision = revisionState.data;
                  const href = revisionState.getLink('self')?.href;
                  return (
                    <TableRow key={revision.id}>
                      <TableCell className="font-medium tabular-nums">
                        v{revision.revisionNumber}
                      </TableCell>
                      <TableCell className="min-w-56">
                        {revision.title}
                      </TableCell>
                      <TableCell>{revision.scenarios.length}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(revision.createdAt)}
                      </TableCell>
                      <TableCell className="max-w-48 truncate font-mono text-xs">
                        {revision.contentSha256}
                      </TableCell>
                      <TableCell className="text-right">
                        {href ? (
                          <Button asChild size="sm" variant="outline">
                            <Link to={href}>打开</Link>
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
          label="Story Revision 分页"
          page={pageState.data.page.number}
          totalPages={pageState.data.page.totalPages}
          hasPrevious={Boolean(pageState.getLink('prev'))}
          hasNext={Boolean(pageState.getLink('next'))}
          pending={pagePending}
          onPrevious={() => void navigatePage('prev')}
          onNext={() => void navigatePage('next')}
        />
      </CardContent>
    </Card>
  );
}

export function StoryRevisionDetailView({
  resourceState,
}: {
  resourceState: State<StoryRevisionResource>;
}) {
  return (
    <Card>
      <CardHeader className="gap-2">
        <Badge className="w-fit" variant="secondary">
          Revision v{resourceState.data.revisionNumber}
        </Badge>
        <CardTitle aria-level={1} role="heading">
          {resourceState.data.title}
        </CardTitle>
        <CardDescription>
          不可变 Story 快照 · {formatDateTime(resourceState.data.createdAt)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <StoryRevisionContent resourceState={resourceState} />
      </CardContent>
    </Card>
  );
}

export function StoryRevisionContent({
  resourceState,
}: {
  resourceState: State<StoryRevisionResource>;
}) {
  const revision = resourceState.data;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <DetailItem label="角色" value={revision.role} />
        <DetailItem
          label="认知模式"
          value={cognitiveModeLabel(revision.cognitiveMode)}
        />
        <DetailItem label="问题" value={revision.problem} variant="multiline" />
        <DetailItem label="目标" value={revision.goal} variant="multiline" />
        <DetailItem label="价值" value={revision.value} variant="multiline" />
        <DetailItem
          label="Story Revision SHA-256"
          value={revision.contentSha256}
          variant="mono"
        />
      </div>
      <Separator />
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium">验收 Scenario</p>
          <p className="text-sm text-muted-foreground">
            按顺序冻结在本 Revision 中的 Given / When / Then 业务结果。
          </p>
        </div>
        {revision.scenarios.length === 0 ? (
          <Alert>
            <AlertDescription>
              此 Revision 尚未包含经人工确认的 Scenario Set。
            </AlertDescription>
          </Alert>
        ) : (
          revision.scenarios.map((scenario) => (
            <Card key={scenario.id} size="sm">
              <CardHeader>
                <Badge className="w-fit" variant="outline">
                  {scenario.reference}
                </Badge>
                <CardTitle aria-level={3} role="heading">
                  {scenario.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <ScenarioPhase label="Given" steps={scenario.given} />
                <ScenarioPhase label="When" steps={[scenario.when]} />
                <ScenarioPhase label="Then" steps={scenario.then} />
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <Separator />
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium">来源引用</p>
          <p className="text-sm text-muted-foreground">
            此 Story Revision 锁定的精确 Inbox Revision。
          </p>
        </div>
        {revision.citations.map((citation) => {
          const href = citation._links.revision?.href;
          return (
            <div
              className="flex flex-col gap-2 rounded-lg border p-4"
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
                    <Link to={href}>打开来源</Link>
                  </Button>
                ) : null}
              </div>
              <p className="break-all font-mono text-xs text-muted-foreground">
                {citation.contentSha256}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScenarioPhase({
  label,
  steps,
}: {
  label: 'Given' | 'When' | 'Then';
  steps: string[];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[5rem_1fr]">
      <Badge className="h-fit w-fit" variant="secondary">
        {label.toUpperCase()}
      </Badge>
      <div className="flex flex-col gap-2">
        {steps.map((step, index) => (
          <p className="whitespace-pre-wrap text-sm" key={`${label}-${index}`}>
            {index > 0 ? '并且 ' : ''}
            {step}
          </p>
        ))}
      </div>
    </div>
  );
}

function DetailItem({
  label,
  value,
  variant = 'plain',
}: {
  label: string;
  value: string;
  variant?: 'plain' | 'multiline' | 'mono';
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={
          variant === 'mono'
            ? 'break-all font-mono text-xs'
            : variant === 'multiline'
              ? 'whitespace-pre-wrap text-sm'
              : 'text-sm'
        }
      >
        {value}
      </p>
    </div>
  );
}

function workflowStageLabel(value: string): string {
  const labels: Record<string, string> = {
    tqa: 'Understand / TQA',
    scenario_review: 'Scenario 审查',
    modeling: '模型影响决定',
    drafting: 'Tasking 起草',
    desk_check: 'Desk Check',
    knowledge_gap: '知识缺口',
    approved: '计划已批准',
    plan_confirmed: 'Pair Plan 已锁定',
    test_written: 'Test 已写入',
    red_observed: 'Red 已观察',
    implementation_written: '实现已写入',
    green_observed: 'Green 已观察',
    refactored: 'Refactor 已完成',
    quality_gate_failed: '质量门失败',
    quality_gates_passed: '质量门已通过',
    exception: 'Pair 异常',
  };
  return labels[value] ?? value;
}

function cognitiveModeLabel(value: string): string {
  return (
    {
      clear: '清晰',
      complicated: '繁杂',
      complex: '复杂',
    }[value] ?? value
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
