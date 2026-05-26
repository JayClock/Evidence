import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
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
  description: string | null;
  tags: string[];
  attributesCount: number;
  behaviorsCount: number;
  href?: string;
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
              <TableHead>Description</TableHead>
              <TableHead>Definition</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logicalEntities.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
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
                    {logicalEntity.href ? (
                      <Link to={logicalEntity.href}>{logicalEntity.title}</Link>
                    ) : (
                      logicalEntity.title
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {logicalEntity.name}
                  </TableCell>
                  <TableCell>{formatEntityType(logicalEntity.type)}</TableCell>
                  <TableCell>{formatSubType(logicalEntity.subType)}</TableCell>
                  <TableCell className="max-w-md whitespace-normal text-sm text-muted-foreground">
                    {logicalEntity.description ?? '—'}
                  </TableCell>
                  <TableCell>
                    <DefinitionSummary
                      tags={logicalEntity.tags}
                      attributesCount={logicalEntity.attributesCount}
                      behaviorsCount={logicalEntity.behaviorsCount}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {logicalEntity.href ? (
                      <Button asChild size="sm" variant="outline">
                        <Link to={logicalEntity.href}>Open</Link>
                      </Button>
                    ) : null}
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
  const definition = data.definition;

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
        <DetailItem label="Created" value={formatDateTime(data.createdAt)} />
        <DetailItem label="Updated" value={formatDateTime(data.updatedAt)} />
        <DetailItem
          className="md:col-span-2"
          label="Description"
          value={definition?.description ?? '—'}
        />
        <div className="md:col-span-2">
          <p className="text-sm font-medium">Definition</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="secondary">
              {definition?.attributes.length ?? 0} attributes
            </Badge>
            <Badge variant="secondary">
              {definition?.behaviors.length ?? 0} behaviors
            </Badge>
            {(definition?.tags ?? []).map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DefinitionSummary({
  tags,
  attributesCount,
  behaviorsCount,
}: {
  tags: string[];
  attributesCount: number;
  behaviorsCount: number;
}) {
  const parts = [`${attributesCount} attrs`, `${behaviorsCount} behaviors`];

  return (
    <div className="flex flex-wrap gap-1">
      {parts.map((part) => (
        <Badge key={part} variant="secondary">
          {part}
        </Badge>
      ))}
      {tags.slice(0, 2).map((tag) => (
        <Badge key={tag} variant="outline">
          {tag}
        </Badge>
      ))}
      {tags.length > 2 ? (
        <Badge variant="outline">+{tags.length - 2}</Badge>
      ) : null}
    </div>
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
      <p className="mt-1 break-words text-sm text-muted-foreground">{value}</p>
    </div>
  );
}

function toLogicalEntityRow(
  entityState: State<LogicalEntityResource>,
): LogicalEntityRow {
  const data = entityState.data;
  const definition = data.definition;

  return {
    id: data.id,
    title: data.label ?? data.name,
    name: data.name,
    type: data.type,
    subType: data.subType,
    description: definition?.description ?? null,
    tags: definition?.tags ?? [],
    attributesCount: definition?.attributes.length ?? 0,
    behaviorsCount: definition?.behaviors.length ?? 0,
    href: entityState.links.getAll().find((link) => link.rel === 'self')?.href,
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

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}
