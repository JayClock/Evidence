import type {
  DesktopPairDecisionAction,
  PairLocalReview,
  PairNextAction,
  PairResource,
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
  Input,
  Spinner,
  Textarea,
} from '@evidence/ui';
import { shortHash } from './delivery-authority-progress';
import {
  approvalPairReturnRoutes,
  nextActionTitle,
  pairDecisionLabel,
  pairExceptionLabel,
  reviewMatchesManifest,
} from './pair-workbench-format';

export function RunningAuthority({
  nextAction,
  pending,
  desktopAvailable,
  onResume,
}: {
  nextAction: PairNextAction | null;
  pending: boolean;
  desktopAvailable: boolean;
  onResume: () => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Alert>
        <AlertTitle>Pair 只执行 Server 发布的锁定动作</AlertTitle>
        <AlertDescription>{nextActionTitle(nextAction)}</AlertDescription>
      </Alert>
      <Button
        disabled={pending || !desktopAvailable}
        onClick={() => void onResume()}
        type="button"
      >
        {pending ? <Spinner data-icon="inline-start" /> : null}
        {pending ? '正在继续…' : '继续 Approved Pair Plan'}
      </Button>
      {!desktopAvailable ? (
        <Alert>
          <AlertDescription>
            Browser 可以查看 bounded Server evidence，但不能运行 Driver 或命令。
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

export function ExceptionAuthority({
  exception,
  pending,
  reason,
  onReasonChange,
  onRoute,
}: {
  exception: NonNullable<PairResource['data']['currentException']>;
  pending: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  onRoute: (action: DesktopPairDecisionAction) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Alert variant="destructive">
        <AlertTitle>{pairExceptionLabel(exception.kind)}</AlertTitle>
        <AlertDescription>{exception.summary}</AlertDescription>
      </Alert>
      <Field data-invalid={!reason.trim()}>
        <FieldLabel htmlFor="pair-route-reason">决定理由</FieldLabel>
        <FieldDescription>
          所有异常路由必填；不要粘贴源码、完整输出或设备路径。
        </FieldDescription>
        <Textarea
          aria-invalid={!reason.trim()}
          id="pair-route-reason"
          onChange={(event) => onReasonChange(event.target.value)}
          value={reason}
        />
      </Field>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {exception.allowedRoutes
          .filter(
            (action): action is DesktopPairDecisionAction =>
              action !== 'approve',
          )
          .map((action) => (
            <Button
              disabled={pending || !reason.trim()}
              key={action}
              onClick={() => void onRoute(action)}
              type="button"
              variant={action === 'cancel' ? 'destructive' : 'outline'}
            >
              {pairDecisionLabel(action)}
            </Button>
          ))}
      </div>
      <Alert>
        <AlertDescription>
          修复会清除当前 Manifest authority；重新通过质量门后创建新的不可变
          Manifest revision，绝不覆盖旧证据。
        </AlertDescription>
      </Alert>
    </div>
  );
}

export function ApprovalAuthority({
  manifest,
  review,
  commitMessage,
  reason,
  authorityConfirmed,
  pending,
  desktopAvailable,
  onLoadReview,
  onCommitMessageChange,
  onReasonChange,
  onAuthorityChange,
  onApprove,
  onRoute,
}: {
  manifest: NonNullable<PairResource['data']['manifest']>;
  review: PairLocalReview | null;
  commitMessage: string;
  reason: string;
  authorityConfirmed: boolean;
  pending: boolean;
  desktopAvailable: boolean;
  onLoadReview: () => Promise<void>;
  onCommitMessageChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onAuthorityChange: (confirmed: boolean) => void;
  onApprove: () => Promise<void>;
  onRoute: (action: DesktopPairDecisionAction) => Promise<void>;
}) {
  const hashesMatch = Boolean(
    review && reviewMatchesManifest(review, manifest),
  );
  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <AlertTitle>全部锁定质量门已通过</AlertTitle>
        <AlertDescription>
          Manifest {shortHash(manifest.contentSha256)} · Diff{' '}
          {shortHash(manifest.finalDiffSha256)} · {manifest.changedPaths.length}{' '}
          paths。
        </AlertDescription>
      </Alert>
      <Button
        disabled={pending || !desktopAvailable}
        onClick={() => void onLoadReview()}
        type="button"
        variant="outline"
      >
        {pending ? <Spinner data-icon="inline-start" /> : null}
        {review ? '重新加载并校验本地 Story Diff' : '加载并校验本地 Story Diff'}
      </Button>
      {!desktopAvailable ? (
        <Alert>
          <AlertDescription>
            请在 Evidence Desktop 中审查完整本地 Diff。Browser-only
            模式不能加载或批准。
          </AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="pair-commit-message">
            Conventional Commit message
          </FieldLabel>
          <FieldDescription>
            只创建在 Iteration branch；不会 merge 或 push。
          </FieldDescription>
          <Input
            id="pair-commit-message"
            onChange={(event) => onCommitMessageChange(event.target.value)}
            value={commitMessage}
          />
        </Field>
        <Field data-invalid={!reason.trim()}>
          <FieldLabel htmlFor="pair-approval-reason">
            编码审查决定理由
          </FieldLabel>
          <FieldDescription>
            批准、退回实现、返回 Tasking 或取消都必须记录理由。
          </FieldDescription>
          <Textarea
            aria-invalid={!reason.trim()}
            id="pair-approval-reason"
            onChange={(event) => onReasonChange(event.target.value)}
            value={reason}
          />
        </Field>
        <Field orientation="horizontal">
          <Checkbox
            checked={authorityConfirmed}
            disabled={!hashesMatch}
            id="confirm-pair-authority"
            onCheckedChange={(value) => onAuthorityChange(value === true)}
          />
          <FieldContent>
            <FieldLabel htmlFor="confirm-pair-authority">
              我已审查完整本地 Story Diff、全部 changed paths 和 Server
              有限证据，并确认 Manifest / diff hash 一致；我理解此决定不 merge
              或 push。
            </FieldLabel>
          </FieldContent>
        </Field>
        <Button
          disabled={
            pending ||
            !desktopAvailable ||
            !hashesMatch ||
            !authorityConfirmed ||
            !reason.trim() ||
            !commitMessage.trim()
          }
          onClick={() => void onApprove()}
          type="button"
        >
          {pending ? <Spinner data-icon="inline-start" /> : null}
          创建本地 commit 并批准 Pair
        </Button>
      </FieldGroup>
      <div className="grid gap-2">
        {approvalPairReturnRoutes().map((action) => (
          <Button
            disabled={pending || !reason.trim()}
            key={action}
            onClick={() => void onRoute(action)}
            type="button"
            variant={action === 'cancel' ? 'destructive' : 'outline'}
          >
            {pairDecisionLabel(action)}
          </Button>
        ))}
      </div>
      <Alert>
        <AlertDescription>
          接受顺序固定：重算 diff hash → 校验 Manifest → 创建一个本地 commit →
          记录 Manifest、Diff、commit hash 与理由。退回修复会使当前 Manifest
          失效。
        </AlertDescription>
      </Alert>
    </div>
  );
}

export function ApprovedAuthority({ pair }: { pair: PairResource['data'] }) {
  const approval = [...pair.decisions]
    .reverse()
    .find(({ action }) => action === 'approve');
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-primary/5 p-4 text-center">
      <Badge className="mx-auto">{pair.run.reference} 已批准</Badge>
      <h3 className="font-medium">本地 commit 与人工决定已锁定</h3>
      <p className="text-sm text-muted-foreground">
        Pair 在 pair / approved 停止；Iteration worktree 保留，不自动进入
        Showcase。
      </p>
      <code className="break-all text-xs">{pair.run.approvedCommitSha}</code>
      {approval ? (
        <p className="text-sm text-muted-foreground">{approval.reason}</p>
      ) : null}
    </div>
  );
}
