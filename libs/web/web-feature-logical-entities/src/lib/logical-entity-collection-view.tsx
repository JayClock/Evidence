import {
  useDeferredValue,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type {
  CreateLogicalEntityInput,
  LogicalEntityCollectionResource,
  LogicalEntityResource,
  LogicalEntitySubType,
  LogicalEntityType,
  State,
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
  EvidenceCanvas,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Inspector,
  MessageResponse,
  PageActions,
  PageDescription,
  PageEyebrow,
  PageHeader,
  PageHeaderCopy,
  PageTitle,
  PageToolbar,
  ScrollArea,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from '@evidence/ui';

type LogicalEntityRow = {
  id: string;
  title: string;
  name: string;
  type: LogicalEntityType;
  subType: LogicalEntitySubType | null;
  content: string;
};

type EntityFilter = 'ALL' | LogicalEntityType;

const entityFilters: Array<{ value: EntityFilter; label: string }> = [
  { value: 'ALL', label: '全部' },
  { value: 'EVIDENCE', label: '证据' },
  { value: 'PARTICIPANT', label: '参与者' },
  { value: 'ROLE', label: '角色' },
  { value: 'CONTEXT', label: '上下文' },
];

export function LogicalEntityCollectionView({
  resourceState,
}: {
  resourceState: State<LogicalEntityCollectionResource>;
}) {
  const [collectionState, setCollectionState] = useState(resourceState);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<EntityFilter>('ALL');
  const [selectedId, setSelectedId] = useState(
    resourceState.collection[0]?.data.id ?? null,
  );
  const deferredQuery = useDeferredValue(
    query.trim().toLocaleLowerCase('zh-CN'),
  );
  const logicalEntities = useMemo(
    () =>
      collectionState.collection
        .map(toLogicalEntityRow)
        .filter((entity) => entityMatches(entity, deferredQuery, filter)),
    [collectionState.collection, deferredQuery, filter],
  );
  const selectedEntity =
    logicalEntities.find((entity) => entity.id === selectedId) ??
    logicalEntities[0];

  async function created(entityState: State<LogicalEntityResource>) {
    const refreshed = (await collectionState
      .follow('self')
      .refresh()) as State<LogicalEntityCollectionResource>;
    setCollectionState(refreshed);
    setSelectedId(entityState.data.id);
  }

  return (
    <EvidenceCanvas>
      <PageHeader>
        <PageHeaderCopy>
          <PageEyebrow>
            权威模型 · {collectionState.data.page.totalElements} 个实体
          </PageEyebrow>
          <PageTitle>逻辑实体</PageTitle>
          <PageDescription>
            管理证据、参与者、角色和限界上下文；实体身份保持稳定，更新不会改写引用关系。
          </PageDescription>
        </PageHeaderCopy>
        <PageActions>
          <CreateEntityDialog
            collectionState={collectionState}
            onCreated={created}
          />
        </PageActions>
      </PageHeader>

      <PageToolbar>
        <Input
          aria-label="搜索逻辑实体"
          className="max-w-md"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索名称、标签或类型…"
          type="search"
          value={query}
        />
        <ToggleGroup
          aria-label="实体类型"
          onValueChange={(value) => {
            if (value) setFilter(value as EntityFilter);
          }}
          size="sm"
          spacing={0}
          type="single"
          value={filter}
          variant="outline"
        >
          {entityFilters.map((item) => (
            <ToggleGroupItem key={item.value} value={item.value}>
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="min-w-0 flex-1" />
        <span className="font-mono text-[0.6875rem] text-muted-foreground">
          显示 {logicalEntities.length} /{' '}
          {collectionState.data.page.totalElements} 个实体
        </span>
      </PageToolbar>

      <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-h-0 overflow-auto bg-card">
          <Table>
            <TableHeader className="sticky top-0 z-[1] bg-secondary">
              <TableRow>
                <TableHead>标签</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>子类型</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logicalEntities.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Empty className="py-12">
                      <EmptyHeader>
                        <EmptyTitle>没有匹配的逻辑实体</EmptyTitle>
                        <EmptyDescription>
                          新增实体，或调整搜索与类型筛选。
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                logicalEntities.map((logicalEntity) => (
                  <TableRow
                    data-state={
                      selectedEntity?.id === logicalEntity.id
                        ? 'selected'
                        : undefined
                    }
                    key={logicalEntity.id}
                  >
                    <TableCell className="font-medium">
                      {logicalEntity.title}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs">{logicalEntity.name}</code>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {formatEntityType(logicalEntity.type)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatSubType(logicalEntity.subType)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        aria-label={`查看 ${logicalEntity.title}`}
                        onClick={() => setSelectedId(logicalEntity.id)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        查看
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <Inspector>
          {selectedEntity ? (
            <EntityInspector logicalEntity={selectedEntity} />
          ) : (
            <Empty className="h-full border-0">
              <EmptyHeader>
                <EmptyTitle>选择实体</EmptyTitle>
                <EmptyDescription>从表格选择实体查看内容。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </Inspector>
      </div>
    </EvidenceCanvas>
  );
}

export function LogicalEntityDetailView({
  resourceState,
}: {
  resourceState: State<LogicalEntityResource>;
}) {
  const data = resourceState.data;
  const title = data.label ?? data.name;

  return (
    <Card className="h-full overflow-auto">
      <CardHeader>
        <CardDescription>逻辑实体</CardDescription>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {formatEntityType(data.type)} · {formatSubType(data.subType)}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-2">
        <DetailItem label="ID" value={data.id} />
        <DetailItem label="名称" value={data.name} />
        <DetailItem
          className="md:col-span-2"
          label="内容"
          value={<MarkdownContent content={data.content} />}
        />
      </CardContent>
    </Card>
  );
}

function EntityInspector({
  logicalEntity,
}: {
  logicalEntity: LogicalEntityRow;
}) {
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div>
        <div className="flex flex-wrap gap-2">
          <Badge>{formatEntityType(logicalEntity.type)}</Badge>
          <Badge variant="outline">
            {formatSubType(logicalEntity.subType)}
          </Badge>
        </div>
        <h2 className="mt-3 text-base font-semibold">{logicalEntity.title}</h2>
        <code className="mt-1 block text-[0.6875rem] text-muted-foreground">
          {logicalEntity.name}
        </code>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <MarkdownContent content={logicalEntity.content} />
      </ScrollArea>
      <LogicalEntityDrawer logicalEntity={logicalEntity} />
    </div>
  );
}

function LogicalEntityDrawer({
  logicalEntity,
}: {
  logicalEntity: LogicalEntityRow;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="outline">
          打开完整内容
        </Button>
      </SheetTrigger>
      <SheetContent
        className="gap-0 overflow-hidden p-0 data-[side=right]:w-[min(92vw,1024px)] data-[side=right]:sm:max-w-none"
        side="right"
      >
        <SheetHeader className="border-b pr-12">
          <SheetTitle>{logicalEntity.title}</SheetTitle>
          <SheetDescription>
            {formatEntityType(logicalEntity.type)} · {logicalEntity.name}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-6">
            <MarkdownContent content={logicalEntity.content} />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function CreateEntityDialog({
  collectionState,
  onCreated,
}: {
  collectionState: State<LogicalEntityCollectionResource>;
  onCreated: (entity: State<LogicalEntityResource>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [type, setType] = useState<LogicalEntityType>('EVIDENCE');
  const [subType, setSubType] = useState('');
  const [content, setContent] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      const input: CreateLogicalEntityInput = {
        name: name.trim(),
        label: label.trim() || null,
        type,
        subType: subType.trim() || null,
        content,
      };
      const created = (await collectionState.follow('self').post({
        data: input,
      })) as State<LogicalEntityResource>;
      await onCreated(created);
      setOpen(false);
      setName('');
      setLabel('');
      setSubType('');
      setContent('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法创建逻辑实体。');
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">新增实体</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>新增逻辑实体</DialogTitle>
          <DialogDescription>
            创建稳定身份的 Evidence、Participant、Role 或 Context。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="logical-entity-label">标签</FieldLabel>
                <Input
                  id="logical-entity-label"
                  onChange={(event) => setLabel(event.target.value)}
                  value={label}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="logical-entity-name">稳定名称</FieldLabel>
                <Input
                  id="logical-entity-name"
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="logical-entity-type">类型</FieldLabel>
                <Select
                  value={type}
                  onValueChange={(value) => setType(value as LogicalEntityType)}
                >
                  <SelectTrigger id="logical-entity-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {entityFilters.slice(1).map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="logical-entity-subtype">子类型</FieldLabel>
                <Input
                  id="logical-entity-subtype"
                  onChange={(event) => setSubType(event.target.value)}
                  value={subType}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="logical-entity-content">
                Markdown 内容
              </FieldLabel>
              <Textarea
                id="logical-entity-content"
                onChange={(event) => setContent(event.target.value)}
                value={content}
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
              <Button disabled={pending} type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button disabled={!name.trim() || pending} type="submit">
              {pending ? <Spinner data-icon="inline-start" /> : null}
              创建实体
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MarkdownContent({ content }: { content?: string | null }) {
  const markdown = content?.trim() ?? '';
  if (!markdown)
    return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <MessageResponse className="text-sm text-foreground [&>*+*]:mt-3 [&_a]:font-medium [&_a]:text-primary [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0">
      {markdown}
    </MessageResponse>
  );
}

function DetailItem({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-1 break-words text-sm text-muted-foreground">
        {value}
      </div>
    </div>
  );
}

function toLogicalEntityRow(
  entityState: State<LogicalEntityResource>,
): LogicalEntityRow {
  const data = entityState.data;
  return {
    id: data.id,
    title: data.label ?? data.name,
    name: data.name,
    type: data.type,
    subType: data.subType,
    content: data.content,
  };
}

function entityMatches(
  entity: LogicalEntityRow,
  query: string,
  filter: EntityFilter,
): boolean {
  if (filter !== 'ALL' && entity.type !== filter) return false;
  if (!query) return true;
  return [entity.title, entity.name, entity.type, entity.subType ?? '']
    .join(' ')
    .toLocaleLowerCase('zh-CN')
    .includes(query);
}

function formatEntityType(value: string) {
  return (
    {
      EVIDENCE: 'Evidence',
      PARTICIPANT: 'Participant',
      ROLE: 'Role',
      CONTEXT: 'Context',
    }[value] ?? value
  );
}

function formatSubType(value: string | null) {
  if (!value) return '—';
  const [, rawValue = value] = value.includes(':')
    ? value.split(/:(.*)/s)
    : ['', value];
  return rawValue
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
