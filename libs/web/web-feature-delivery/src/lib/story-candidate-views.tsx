import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type {
  State,
  StoryCandidateCollectionResource,
  StoryCandidateDecisionInput,
  StoryCandidateResource,
  StoryCandidateStatus,
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  ScrollArea,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Textarea,
} from '@evidence/ui';
import { DeliveryPagination } from './delivery-pagination';

type CandidateStatusFilter = StoryCandidateStatus | 'all';
type CandidateDecisionAction = 'defer' | 'reject';

export function StoryCandidateCollectionView({
  resourceState,
}: {
  resourceState: State<StoryCandidateCollectionResource>;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const initialParameters = new URLSearchParams(location.search);
  const [collectionState, setCollectionState] = useState(resourceState);
  const [candidateStates, setCandidateStates] = useState(() =>
    resourceState.collection.slice(),
  );
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    resourceState.collection[0]?.data.id ?? null,
  );
  const [query, setQuery] = useState(initialParameters.get('q') ?? '');
  const [status, setStatus] = useState<CandidateStatusFilter>(() =>
    candidateStatusFilter(initialParameters.get('status')),
  );
  const [pagePending, setPagePending] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const selectedCandidateState =
    candidateStates.find(
      (candidateState) => candidateState.data.id === selectedCandidateId,
    ) ?? candidateStates[0];
  const selfHref = collectionState.getLink('self')?.href;
  const extractionHref = collectionState.getLink('extraction')?.href;

  const navigatePage = async (relation: 'prev' | 'next') => {
    if (!collectionState.getLink(relation) || pagePending) return;
    setPagePending(true);
    setPageError(null);
    try {
      const nextState = (await collectionState
        .follow(relation)
        .refresh()) as State<StoryCandidateCollectionResource>;
      setCollectionState(nextState);
      setCandidateStates(nextState.collection.slice());
      setSelectedCandidateId(nextState.collection[0]?.data.id ?? null);
    } catch (caught) {
      setPageError(errorMessage(caught, '无法载入候选页面。'));
    } finally {
      setPagePending(false);
    }
  };

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selfHref) return;
    navigate(candidateCollectionHref(selfHref, query, status));
  };

  const resetFilters = () => {
    if (!selfHref) return;
    setQuery('');
    setStatus('all');
    navigate(candidateCollectionHref(selfHref, '', 'all'));
  };

  const updateCandidate = (nextState: State<StoryCandidateResource>) => {
    setCandidateStates((current) =>
      current.map((candidateState) =>
        candidateState.data.id === nextState.data.id
          ? nextState
          : candidateState,
      ),
    );
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-1 lg:overflow-hidden">
      <header className="flex shrink-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Inbox Analyst 已完成
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">故事候选</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            候选是带精确来源引用的非权威提案，没有 Story ID。人工选择只会创建
            Iteration 与 Frozen Intake；只有后续 Kickoff confirm 才能创建
            Story。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {extractionHref ? (
            <Button asChild variant="outline">
              <Link to={extractionHref}>查看 Extraction</Link>
            </Button>
          ) : null}
        </div>
      </header>

      <AuthorityProgress />

      <form
        className="shrink-0 rounded-xl bg-card p-3 ring-1 ring-foreground/10"
        onSubmit={applyFilters}
      >
        <FieldGroup className="grid gap-2 lg:grid-cols-[minmax(14rem,1fr)_12rem_auto_auto]">
          <Field>
            <FieldLabel className="sr-only" htmlFor="candidate-search">
              搜索候选
            </FieldLabel>
            <Input
              id="candidate-search"
              placeholder="搜索候选标题、角色或目标…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel className="sr-only" htmlFor="candidate-status-filter">
              状态筛选
            </FieldLabel>
            <Select
              value={status}
              onValueChange={(value) =>
                setStatus(value as CandidateStatusFilter)
              }
            >
              <SelectTrigger id="candidate-status-filter" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="ready">可选择</SelectItem>
                  <SelectItem value="stale">来源已变化</SelectItem>
                  <SelectItem value="selected">已选择</SelectItem>
                  <SelectItem value="deferred">已暂缓</SelectItem>
                  <SelectItem value="rejected">已拒绝</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Button disabled={!selfHref} type="submit" variant="outline">
            应用筛选
          </Button>
          <Button
            disabled={!selfHref || (!query && status === 'all')}
            type="button"
            variant="ghost"
            onClick={resetFilters}
          >
            清除
          </Button>
        </FieldGroup>
      </form>

      {pageError ? (
        <Alert variant="destructive">
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      ) : null}

      {candidateStates.length === 0 ? (
        <Empty className="min-h-80 flex-1 rounded-xl border bg-card">
          <EmptyHeader>
            <EmptyTitle>没有符合条件的候选</EmptyTitle>
            <EmptyDescription>
              返回收件箱选择 active 来源，并运行本地 Inbox Analyst。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid min-h-[34rem] shrink-0 rounded-xl border bg-card lg:min-h-0 lg:flex-1 lg:grid-cols-[19rem_minmax(0,1fr)] lg:overflow-hidden">
          <CandidateList
            candidateStates={candidateStates}
            selectedCandidateId={selectedCandidateState?.data.id ?? null}
            onSelect={setSelectedCandidateId}
          />
          {selectedCandidateState ? (
            <div className="border-t lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l">
              <CandidateReviewPanel
                key={selectedCandidateState.data.id}
                resourceState={selectedCandidateState}
                onChange={updateCandidate}
              />
            </div>
          ) : null}
        </div>
      )}

      <DeliveryPagination
        label="故事候选分页"
        page={collectionState.data.page.number}
        totalPages={collectionState.data.page.totalPages}
        hasPrevious={Boolean(collectionState.getLink('prev'))}
        hasNext={Boolean(collectionState.getLink('next'))}
        pending={pagePending}
        onPrevious={() => void navigatePage('prev')}
        onNext={() => void navigatePage('next')}
      />
    </section>
  );
}

export function StoryCandidateDetailView({
  resourceState,
}: {
  resourceState: State<StoryCandidateResource>;
}) {
  return (
    <section className="h-full overflow-y-auto rounded-xl border bg-card">
      <CandidateReviewPanel resourceState={resourceState} />
    </section>
  );
}

function AuthorityProgress() {
  const steps = [
    ['1', '来源已冻结', '精确 Revision'],
    ['2', '人工选择 Candidate', '当前阶段'],
    ['3', 'Kickoff 人工决定', '尚未授权'],
    ['4', '创建 US-001', '仅 confirm'],
  ] as const;

  return (
    <ol
      aria-label="Inbox 到 Story 权威流程"
      className="grid shrink-0 overflow-hidden rounded-xl border bg-card sm:grid-cols-2 xl:grid-cols-4"
    >
      {steps.map(([number, label, detail], index) => (
        <li
          className="flex min-w-0 items-center gap-3 border-b px-4 py-3 last:border-b-0 xl:border-r xl:border-b-0 xl:last:border-r-0"
          key={number}
        >
          <Badge variant={index < 2 ? 'default' : 'outline'}>{number}</Badge>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-medium">{label}</span>
            <span className="truncate text-xs text-muted-foreground">
              {detail}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function CandidateList({
  candidateStates,
  selectedCandidateId,
  onSelect,
}: {
  candidateStates: State<StoryCandidateResource>[];
  selectedCandidateId: string | null;
  onSelect: (candidateId: string) => void;
}) {
  return (
    <aside
      className="flex h-72 min-h-0 flex-col lg:h-auto"
      aria-label="候选列表"
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="text-sm font-medium">本次提取的候选</p>
        <Badge variant="secondary">{candidateStates.length}</Badge>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col p-2">
          {candidateStates.map((candidateState) => {
            const candidate = candidateState.data;
            const selected = candidate.id === selectedCandidateId;
            return (
              <Button
                aria-pressed={selected}
                className="h-auto w-full flex-col items-stretch justify-start gap-2 px-3 py-3 text-left whitespace-normal"
                key={candidate.id}
                type="button"
                variant={selected ? 'secondary' : 'ghost'}
                onClick={() => onSelect(candidate.id)}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {candidate.reference}
                  </span>
                  <CandidateStatusBadge status={candidate.status} />
                </span>
                <span className="line-clamp-2 text-sm font-medium">
                  {candidate.title}
                </span>
                <span className="line-clamp-2 text-xs font-normal text-muted-foreground">
                  {candidate.problem}
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {formatDateTime(candidate.proposedAt)}
                </span>
              </Button>
            );
          })}
        </div>
      </ScrollArea>
    </aside>
  );
}

function CandidateReviewPanel({
  resourceState,
  onChange,
}: {
  resourceState: State<StoryCandidateResource>;
  onChange?: (nextState: State<StoryCandidateResource>) => void;
}) {
  const navigate = useNavigate();
  const [candidateState, setCandidateState] = useState(resourceState);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const candidate = candidateState.data;
  const bridge = window.evidenceDesktop;

  const replaceCandidate = (nextState: State<StoryCandidateResource>) => {
    setCandidateState(nextState);
    onChange?.(nextState);
  };

  const decide = async (action: CandidateDecisionAction, reason: string) => {
    if (!candidateState.getLink(action) || pending) return;
    setPending(true);
    setError(null);
    try {
      const input: StoryCandidateDecisionInput = {
        candidateSha256: candidate.contentSha256,
        reason,
      };
      replaceCandidate(
        (await candidateState.follow(action).post({
          data: input,
        })) as State<StoryCandidateResource>,
      );
    } catch (caught) {
      setError(errorMessage(caught, '无法记录候选决定。'));
      throw caught;
    } finally {
      setPending(false);
    }
  };

  const startIteration = async (): Promise<boolean> => {
    if (!bridge?.startIteration || !candidateState.getLink('select') || pending)
      return false;
    setPending(true);
    setError(null);
    try {
      await bridge.startIteration({
        id: requestId('iteration'),
        workspaceId: workspaceId(candidateState),
        candidateId: candidate.id,
      });
      const selected = (await candidateState
        .follow('self')
        .refresh()) as State<StoryCandidateResource>;
      replaceCandidate(selected);
      const href = selected.getLink('iteration')?.href;
      if (!href)
        throw new Error('已选择的 Candidate 缺少 Iteration relation。');
      navigate(href);
      return true;
    } catch (caught) {
      setError(errorMessage(caught, '无法开始 Iteration。'));
      return false;
    } finally {
      setPending(false);
    }
  };

  const iterationHref = candidateState.getLink('iteration')?.href;

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {candidate.reference}
            </span>
            <CandidateStatusBadge status={candidate.status} />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {candidate.title}
          </h2>
          <p className="text-sm text-muted-foreground">
            Inbox Analyst 提出于 {formatDateTime(candidate.proposedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {candidateState.getLink('defer') ? (
            <CandidateDecisionDialog
              action="defer"
              disabled={pending}
              onDecide={decide}
            />
          ) : null}
          {candidateState.getLink('reject') ? (
            <CandidateDecisionDialog
              action="reject"
              disabled={pending}
              onDecide={decide}
            />
          ) : null}
          {candidateState.getLink('select') ? (
            <CandidateSelectionDialog
              candidate={candidate}
              disabled={pending || !bridge?.startIteration}
              onSelect={startIteration}
            />
          ) : null}
          {iterationHref ? (
            <Button asChild>
              <Link to={iterationHref}>打开 Iteration</Link>
            </Button>
          ) : null}
        </div>
      </header>

      <Alert>
        <AlertDescription>
          <strong>这不是 Story。</strong> Candidate 没有 US-001
          身份，也没有人工权威。选择动作只会 claim WIP、创建 Iteration 并冻结
          Intake。
        </AlertDescription>
      </Alert>

      {candidate.status === 'stale' ? (
        <Alert>
          <AlertDescription>
            引用来源已有更新，此 Candidate 不能再被选择。可记录暂缓或拒绝决定。
          </AlertDescription>
        </Alert>
      ) : null}

      {!bridge?.startIteration && candidate.status === 'ready' ? (
        <Alert>
          <AlertDescription>
            请在 Evidence Desktop 中打开并绑定当前 Workspace，才能选择 Candidate
            和 provision 隔离 worktree。
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <DetailItem label="角色" value={candidate.role} />
        <DetailItem
          label="认知模式"
          value={cognitiveModeLabel(candidate.cognitiveMode)}
        />
        <div className="sm:col-span-2">
          <DetailItem label="问题" value={candidate.problem} />
        </div>
        <DetailItem label="目标" value={candidate.goal} />
        <DetailItem label="价值" value={candidate.value} />
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardDescription>候选 Lean Story 表述</CardDescription>
          <CardTitle className="text-base">
            作为{candidate.role}，我希望{candidate.goal}，从而{candidate.value}
          </CardTitle>
        </CardHeader>
      </Card>

      <CitationCard citations={candidate.citations} />

      <div className="flex flex-col gap-2 rounded-lg border p-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Candidate SHA-256
        </p>
        <code className="break-all text-xs">{candidate.contentSha256}</code>
      </div>
    </div>
  );
}

function CandidateSelectionDialog({
  candidate,
  disabled,
  onSelect,
}: {
  candidate: StoryCandidateResource['data'];
  disabled: boolean;
  onSelect: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const confirm = async () => {
    if (disabled || submitting) return;
    setSubmitting(true);
    try {
      if (await onSelect()) setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled} type="button">
          选择并开始 Iteration
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>选择 Candidate 并开始 Iteration</DialogTitle>
          <DialogDescription>
            此人工动作会 claim 当前 Candidate、占用 WIP，并从精确引用复制自包含
            Frozen Intake。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 rounded-lg border p-4 text-sm">
          <ConfirmationRow label="Candidate" value={candidate.reference} />
          <ConfirmationRow
            label="Candidate SHA-256"
            value={shortHash(candidate.contentSha256)}
            mono
          />
          <ConfirmationRow label="将创建" value="Iteration + Frozen Intake" />
          <ConfirmationRow label="不会创建" value="Story / US-001" />
        </div>
        <Alert>
          <AlertDescription>
            Desktop 将锁定当前 Git baseline 并 provision 隔离分支和
            worktree；Server 不会接收本地绝对路径。
          </AlertDescription>
        </Alert>
        <DialogFooter>
          <DialogClose asChild>
            <Button disabled={submitting} type="button" variant="outline">
              取消
            </Button>
          </DialogClose>
          <Button
            disabled={disabled || submitting}
            type="button"
            onClick={() => void confirm()}
          >
            {submitting ? '正在开始…' : '确认选择'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CandidateDecisionDialog({
  action,
  disabled,
  onDecide,
}: {
  action: CandidateDecisionAction;
  disabled: boolean;
  onDecide: (action: CandidateDecisionAction, reason: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const actionLabel = candidateDecisionLabel(action);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reason.trim() || disabled) return;
    setError(null);
    try {
      await onDecide(action, reason.trim());
      setReason('');
      setOpen(false);
    } catch (caught) {
      setError(errorMessage(caught, `无法${actionLabel}此候选。`));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          disabled={disabled}
          type="button"
          variant={action === 'reject' ? 'destructive' : 'outline'}
        >
          {actionLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{actionLabel} Candidate</DialogTitle>
          <DialogDescription>
            这是不可撤销的终态人工决定。请记录选择该处置的原因。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor={`${action}-candidate-reason`}>
                决定理由
              </FieldLabel>
              <Textarea
                aria-invalid={Boolean(error)}
                id={`${action}-candidate-reason`}
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </FieldGroup>
          <DialogFooter className="mt-5">
            <DialogClose asChild>
              <Button disabled={disabled} type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button
              disabled={!reason.trim() || disabled}
              type="submit"
              variant={action === 'reject' ? 'destructive' : 'default'}
            >
              记录{actionLabel}决定
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CitationCard({
  citations,
}: {
  citations: StoryCandidateResource['data']['citations'];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">精确 Inbox 引用</CardTitle>
            <CardDescription>
              Candidate 仅受这些不可变 Revision hash 约束。
            </CardDescription>
          </div>
          <Badge variant="secondary">{citations.length} 个来源</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {citations.map((citation, index) => (
          <div
            className="flex flex-col gap-3"
            key={`${citation.inboxRevisionId}:${citation.locator}`}
          >
            {index > 0 ? <Separator /> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailItem
                label="Inbox Item"
                value={citation.inboxItemId}
                mono
              />
              <DetailItem
                label="Revision"
                value={`v${String(citation.revisionNumber)} · ${citation.inboxRevisionId}`}
                mono
              />
              <DetailItem label="定位" value={citation.locator} />
              <DetailItem
                label="Revision SHA-256"
                value={citation.revisionSha256}
                mono
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DetailItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border p-3">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={
          mono
            ? 'mt-1 break-all font-mono text-xs'
            : 'mt-1 whitespace-pre-wrap text-sm'
        }
      >
        {value}
      </p>
    </div>
  );
}

function ConfirmationRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[9rem_1fr]">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'break-all font-mono text-xs' : 'font-medium'}>
        {value}
      </span>
    </div>
  );
}

function CandidateStatusBadge({ status }: { status: StoryCandidateStatus }) {
  const variant =
    status === 'ready'
      ? 'default'
      : status === 'stale' || status === 'selected'
        ? 'secondary'
        : 'outline';
  return <Badge variant={variant}>{candidateStatusLabel(status)}</Badge>;
}

function candidateCollectionHref(
  selfHref: string,
  query: string,
  status: CandidateStatusFilter,
): string {
  const url = new URL(
    selfHref,
    globalThis.location?.origin ?? 'http://localhost',
  );
  url.searchParams.set('page', '1');
  const normalizedQuery = query.trim();
  if (normalizedQuery) url.searchParams.set('q', normalizedQuery);
  else url.searchParams.delete('q');
  if (status === 'all') url.searchParams.delete('status');
  else url.searchParams.set('status', status);
  return `${url.pathname}${url.search}`;
}

function candidateStatusFilter(value: string | null): CandidateStatusFilter {
  return value === 'ready' ||
    value === 'stale' ||
    value === 'selected' ||
    value === 'deferred' ||
    value === 'rejected'
    ? value
    : 'all';
}

function candidateStatusLabel(status: StoryCandidateStatus): string {
  const labels: Record<StoryCandidateStatus, string> = {
    ready: '可选择',
    stale: '来源已变化',
    selected: '已选择',
    deferred: '已暂缓',
    rejected: '已拒绝',
  };
  return labels[status];
}

function candidateDecisionLabel(action: CandidateDecisionAction): string {
  return action === 'defer' ? '暂缓' : '拒绝';
}

function cognitiveModeLabel(value: string): string {
  const labels: Record<string, string> = {
    clear: '清晰',
    complicated: '繁杂',
    complex: '复杂',
  };
  return labels[value] ?? value;
}

function workspaceId(state: State<StoryCandidateResource>): string {
  const href = state.getLink('workspace')?.href;
  const match = href && /\/workspaces\/([^/?#]+)/.exec(href);
  if (!match?.[1]) throw new Error('Candidate 缺少 Workspace relation。');
  return decodeURIComponent(match[1]);
}

function requestId(prefix: string): string {
  return `${prefix}:${globalThis.crypto?.randomUUID?.() ?? String(Date.now())}`;
}

function shortHash(value: string): string {
  return value.length > 24 ? `${value.slice(0, 16)}…${value.slice(-8)}` : value;
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
