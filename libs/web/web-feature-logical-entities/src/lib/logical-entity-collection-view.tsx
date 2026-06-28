import { useMemo, type ReactNode } from 'react';
import {
  type LogicalEntityCollectionResource,
  type LogicalEntityResource,
  type LogicalEntitySubType,
  type LogicalEntityType,
  type State,
} from '@evidence/api-client';
import {
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
  MessageResponse,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@evidence/ui';

type LogicalEntityRow = {
  id: string;
  title: string;
  name: string;
  type: LogicalEntityType;
  subType: LogicalEntitySubType | null;
  content: string;
};

export function LogicalEntityCollectionView({
  resourceState,
}: {
  resourceState: State<LogicalEntityCollectionResource>;
}) {
  const logicalEntities = useMemo(
    () => resourceState.collection.map(toLogicalEntityRow),
    [resourceState.collection],
  );

  return (
    <section className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Collection
          </p>
          <h2 className="text-xl font-semibold tracking-tight">
            Logical Entities
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage evidence, participants, roles, and contexts in this
            workspace.
          </p>
        </div>
        <Badge variant="secondary">
          {resourceState.data.page.totalElements} total
        </Badge>
      </div>

      <div className="mt-4 rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Subtype</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logicalEntities.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Empty className="py-8">
                    <EmptyHeader>
                      <EmptyTitle>No logical entities found</EmptyTitle>
                      <EmptyDescription>
                        Add evidence, participants, roles, or contexts to this
                        workspace.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : (
              logicalEntities.map((logicalEntity) => (
                <TableRow key={logicalEntity.id}>
                  <TableCell className="font-medium">
                    {logicalEntity.title}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {logicalEntity.name}
                  </TableCell>
                  <TableCell>{formatEntityType(logicalEntity.type)}</TableCell>
                  <TableCell>{formatSubType(logicalEntity.subType)}</TableCell>
                  <TableCell className="text-right">
                    <LogicalEntityDrawer logicalEntity={logicalEntity} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
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
    <Card>
      <CardHeader>
        <CardDescription>Logical entity</CardDescription>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {formatEntityType(data.type)} · {formatSubType(data.subType)}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-2">
        <DetailItem label="ID" value={data.id} />
        <DetailItem label="Name" value={data.name} />
        <DetailItem
          className="md:col-span-2"
          label="Content"
          value={<MarkdownContent content={data.content} />}
        />
      </CardContent>
    </Card>
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
        <Button
          aria-label={`Open ${logicalEntity.title}`}
          size="sm"
          type="button"
          variant="outline"
        >
          Open
        </Button>
      </SheetTrigger>
      <SheetContent
        aria-describedby={undefined}
        className="gap-0 overflow-hidden p-0 data-[side=right]:w-[min(92vw,1024px)] data-[side=right]:sm:max-w-none"
        side="right"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{logicalEntity.title}</SheetTitle>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="p-6 pr-12">
            <MarkdownContent content={logicalEntity.content} />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function MarkdownContent({ content }: { content: string }) {
  const markdown = content.trim();

  if (!markdown) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

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

function formatEntityType(value: string) {
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatSubType(value: string | null) {
  if (!value) {
    return '—';
  }

  const [, rawValue = value] = value.includes(':')
    ? value.split(/:(.*)/s)
    : ['', value];
  return formatEntityType(rawValue);
}
