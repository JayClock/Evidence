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
  EvidencePage,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  PageActions,
  PageDescription,
  PageEyebrow,
  PageHeader,
  PageHeaderCopy,
  PageTitle,
  PageToolbar,
  ScrollArea,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from '@evidence/ui';
import { DeliveryPagination } from './delivery-pagination';

type CandidateStatusFilter = StoryCandidateStatus | 'all';
type CandidateDecisionAction = 'defer' | 'reject';

const candidateStatusOptions: Array<{
  value: CandidateStatusFilter;
  label: string;
}> = [
  { value: 'all', label: '全部' },
  { value: 'ready', label: '可选择' },
  { value: 'stale', label: '来源已变化' },
  { value: 'selected', label: '已决定' },
];

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
    <EvidencePage>
      <PageHeader className="px-4 pt-3.5 pb-[0.6875rem]">
        <PageHeaderCopy>
          <PageEyebrow>Inbox Analyst 已完成</PageEyebrow>
          <PageTitle className="leading-7">故事候选</PageTitle>
          <PageDescription>
            候选是带精确来源引用的非权威提案。只有人工选择 ready Candidate
            后，才会冻结 Intake 并创建 Iteration。
          </PageDescription>
        </PageHeaderCopy>
        <PageActions>
          {extractionHref ? (
            <Button asChild size="sm" variant="outline">
              <Link to={extractionHref}>查看提取</Link>
            </Button>
          ) : null}
        </PageActions>
      </PageHeader>

      <AuthorityProgress />

      <PageToolbar>
        <form
          className="flex w-full min-w-0 items-center gap-2"
          onSubmit={applyFilters}
        >
          <Field className="min-w-0 flex-1">
            <FieldLabel className="sr-only" htmlFor="candidate-search">
              搜索候选
            </FieldLabel>
            <Input
              id="candidate-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索候选标题、角色或目标…"
              value={query}
            />
          </Field>
          <ToggleGroup
            aria-label="候选状态"
            onValueChange={(value) => {
              if (value) setStatus(value as CandidateStatusFilter);
            }}
            size="sm"
            spacing={0}
            type="single"
            value={status}
            variant="outline"
          >
            {candidateStatusOptions.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value}>
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button
            disabled={!selfHref}
            size="sm"
            type="submit"
            variant="outline"
          >
            应用筛选
          </Button>
          <Button
            disabled={!selfHref || (!query && status === 'all')}
            onClick={resetFilters}
            size="sm"
            type="button"
            variant="ghost"
          >
            清除
          </Button>
        </form>
      </PageToolbar>

      {pageError ? (
        <Alert className="m-2" variant="destructive">
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      ) : null}

      {candidateStates.length === 0 ? (
        <Empty className="min-h-80 flex-1 border-0">
          <EmptyHeader>
            <EmptyTitle>没有符合条件的候选</EmptyTitle>
            <EmptyDescription>
              返回收件箱选择 active 来源，并运行本地 Inbox Analyst。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[21.875rem_minmax(0,1fr)]">
          <CandidateList
            candidateStates={candidateStates}
            selectedCandidateId={selectedCandidateState?.data.id ?? null}
            onSelect={setSelectedCandidateId}
          />
          {selectedCandidateState ? (
            <CandidateReviewPanel
              key={selectedCandidateState.data.id}
              resourceState={selectedCandidateState}
              onChange={updateCandidate}
            />
          ) : null}
        </div>
      )}

      <div className="shrink-0 border-t px-3 pb-2">
        <DeliveryPagination
          hasNext={Boolean(collectionState.getLink('next'))}
          hasPrevious={Boolean(collectionState.getLink('prev'))}
          label="故事候选分页"
          page={collectionState.data.page.number}
          pending={pagePending}
          totalPages={collectionState.data.page.totalPages}
          onNext={() => void navigatePage('next')}
          onPrevious={() => void navigatePage('prev')}
        />
      </div>
    </EvidencePage>
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
    <div className="h-[3.625rem] shrink-0 px-4 pb-[0.6875rem]">
      <ol
        aria-label="Inbox 到 Story 权威流程"
        className="grid h-[2.9375rem] overflow-hidden rounded-lg border bg-card sm:grid-cols-2 xl:grid-cols-4"
      >
        {steps.map(([number, label, detail], index) => (
          <li
            className="flex min-w-0 items-center gap-2 border-b px-3 last:border-b-0 xl:border-r xl:border-b-0 xl:last:border-r-0"
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
    </div>
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
      className="flex h-72 min-h-0 flex-col border-b bg-secondary lg:h-auto lg:border-r lg:border-b-0"
      aria-label="候选列表"
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
        <p className="text-xs font-semibold">本次提取的候选</p>
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
    <div className="flex h-full min-h-0 flex-col bg-card">
      <header className="flex h-[5.125rem] shrink-0 flex-col gap-3 border-b px-[0.9375rem] py-[0.8125rem] lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="truncate font-mono text-[0.6875rem] text-muted-foreground">
            {candidateStatusLabel(candidate.status)} · {candidate.reference} ·
            Inbox Analyst 提出于 {formatDateTime(candidate.proposedAt)}
          </p>
          <h2 className="mt-1 truncate text-base font-semibold">
            {candidate.title}
          </h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            来自 {candidate.extractionId} 的一次性、来源受限提案
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
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
            <Button asChild size="sm">
              <Link to={iterationHref}>打开 Iteration</Link>
            </Button>
          ) : null}
        </div>
      </header>

      <Tabs className="min-h-0 flex-1 gap-0" defaultValue="content">
        <TabsList
          className="h-10 w-full shrink-0 justify-start rounded-none border-b px-4"
          variant="line"
        >
          <TabsTrigger className="flex-none px-3" value="content">
            候选内容
          </TabsTrigger>
          <TabsTrigger className="flex-none px-3" value="sources">
            冻结来源 {candidate.citations.length}
          </TabsTrigger>
        </TabsList>
        <TabsContent className="mt-0 min-h-0 overflow-hidden" value="content">
          <div className="grid h-full min-h-0 overflow-hidden xl:grid-cols-[minmax(0,1fr)_18.25rem]">
            <ScrollArea className="min-h-0">
              <div className="flex flex-col gap-4 p-4">
                <Alert>
                  <AlertDescription>
                    <strong>这不是 Story。</strong> Candidate 没有 US-001
                    身份，也没有人工权威。选择只会创建 Iteration 与 Frozen
                    Intake。
                  </AlertDescription>
                </Alert>

                {candidate.status === 'stale' ? (
                  <Alert>
                    <AlertDescription>
                      引用来源已有更新，此 Candidate 不能再被选择。
                    </AlertDescription>
                  </Alert>
                ) : null}
                {!bridge?.startIteration && candidate.status === 'ready' ? (
                  <Alert>
                    <AlertDescription>
                      请在 Evidence Desktop 中绑定当前 Workspace 后选择
                      Candidate。
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

                <Card className="bg-ev-brand-soft">
                  <CardHeader>
                    <CardDescription>候选 Lean Story 表述</CardDescription>
                    <CardTitle>
                      作为{candidate.role}，我希望{candidate.goal}，从而
                      {candidate.value}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>
            </ScrollArea>
            <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto border-t bg-ev-soft p-3.5 xl:border-t-0 xl:border-l">
              <CitationCard citations={candidate.citations} />
              <CandidateHash value={candidate.contentSha256} />
            </aside>
          </div>
        </TabsContent>
        <TabsContent className="mt-0 min-h-0 overflow-hidden" value="sources">
          <ScrollArea className="h-full">
            <div className="mx-auto grid max-w-4xl gap-4 p-4 md:grid-cols-[minmax(0,1fr)_18.25rem]">
              <CitationCard citations={candidate.citations} />
              <CandidateHash value={candidate.contentSha256} />
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CandidateHash({ value }: { value: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>Candidate SHA-256</CardDescription>
      </CardHeader>
      <CardContent>
        <code className="break-all text-[0.625rem]">{value}</code>
      </CardContent>
    </Card>
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
        <Button disabled={disabled} size="sm" type="button">
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
          size="sm"
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
    <Card size="sm">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>精确 Inbox 引用</CardTitle>
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
