import { useMemo, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import {
  HEALTH_DIMENSIONS,
  inspectModelHealth,
  type DomainGraph,
  type ModelHealthIssue,
} from '@evidence-poc/evidence-model-core';
import {
  Button,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@evidence-poc/desktop-ui-kit';

const LEVEL = { priority: '优先澄清', review: '建议复核', notice: '提示' };
const DIMENSIONS = Object.keys(
  HEALTH_DIMENSIONS,
) as ModelHealthIssue['dimension'][];

type RadarAction = { kind: 'locate' | 'guide'; issueId: string };

export const ModelHealthRadar = ({
  graph,
  canLocate,
  inquiryBusy,
  onAction,
}: {
  graph: DomainGraph;
  canLocate: (nodeId: string) => boolean;
  inquiryBusy: boolean;
  onAction: (kind: RadarAction['kind'], issue: ModelHealthIssue) => boolean;
}) => {
  const report = useMemo(() => inspectModelHealth(graph), [graph]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<ModelHealthIssue['dimension'] | 'all'>(
    'all',
  );
  const pendingAction = useRef<RadarAction | null>(null);
  const jump = (action: RadarAction) => {
    pendingAction.current = action;
    setOpen(false);
  };
  const issues =
    filter === 'all'
      ? report.issues
      : report.issues.filter(({ dimension }) => dimension === filter);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Activity aria-hidden="true" data-icon="inline-start" />
          体检{report.overallScore === null ? '' : ` ${report.overallScore} 分`}
          {report.issues.length > 0 ? ` · ${report.issues.length} 项` : ''}
        </Button>
      </SheetTrigger>
      <SheetContent
        className="max-w-md"
        data-evidence-capture-hide=""
        onCloseAutoFocus={(event) => {
          const action = pendingAction.current;
          pendingAction.current = null;
          const issue =
            action && report.issues.find(({ id }) => id === action.issueId);
          if (action && issue && onAction(action.kind, issue))
            event.preventDefault();
        }}
      >
        <SheetHeader>
          <SheetTitle>8X Flow 模型体检</SheetTitle>
          <SheetDescription>
            只提示当前模型中可观察的缺口；评分不是业务批准，也不影响保存或交付。
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-3 rounded-lg border border-workbench-border p-3 text-xs">
            {DIMENSIONS.map((dimension) => {
              const { score, checks, issueCount } =
                report.dimensions[dimension];
              return (
                <div key={dimension} className="flex flex-col gap-1">
                  <dt className="font-medium">
                    {HEALTH_DIMENSIONS[dimension]}
                  </dt>
                  <dd className="text-workbench-muted">
                    {score === null
                      ? '暂无可评估项'
                      : `${score} 分 · ${issueCount}/${checks} 项提示`}
                  </dd>
                </div>
              );
            })}
          </dl>
          <div
            role="group"
            aria-label="按体检维度筛选"
            className="flex flex-wrap gap-1"
          >
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-pressed={filter === 'all'}
              onClick={() => setFilter('all')}
              className="aria-pressed:bg-workbench-subtle"
            >
              全部
            </Button>
            {DIMENSIONS.map((dimension) => (
              <Button
                key={dimension}
                type="button"
                variant="ghost"
                size="xs"
                aria-pressed={filter === dimension}
                onClick={() => setFilter(dimension)}
                className="aria-pressed:bg-workbench-subtle"
              >
                {HEALTH_DIMENSIONS[dimension]}
              </Button>
            ))}
          </div>
          {issues.length === 0 ? (
            <p className="text-xs text-workbench-muted">
              {report.overallScore === null
                ? '当前没有可评估的履约或协作事项。'
                : '此范围内未发现体检提示。'}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {issues.map((issue) => (
                <li
                  key={issue.id}
                  className="flex flex-col gap-2 rounded-md border border-workbench-border p-3 text-xs"
                >
                  <div>
                    <p className="text-workbench-muted">
                      {LEVEL[issue.severity]} ·{' '}
                      {HEALTH_DIMENSIONS[issue.dimension]}
                    </p>
                    <h3 className="mt-1 font-medium">{issue.message}</h3>
                    <p className="mt-1 text-workbench-muted">
                      {issue.question}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {canLocate(issue.targetNodeId) ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        aria-label={`定位：${issue.message}`}
                        onClick={() =>
                          jump({ kind: 'locate', issueId: issue.id })
                        }
                      >
                        定位
                      </Button>
                    ) : null}
                    {issue.inquiry && canLocate(issue.inquiry.nodeId) ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        aria-label={`${issue.inquiry.kind === 'story' ? '在放映中推演' : '引导澄清'}：${issue.message}`}
                        disabled={inquiryBusy}
                        onClick={() =>
                          jump({ kind: 'guide', issueId: issue.id })
                        }
                      >
                        {issue.inquiry.kind === 'story'
                          ? '在放映中推演'
                          : '引导澄清'}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
};
