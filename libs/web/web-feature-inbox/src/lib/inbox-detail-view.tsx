import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type {
  InboxItemResource,
  InboxItemStatus,
  InboxItemStatusInput,
  InboxRevisionCollectionResource,
  InboxRevisionResource,
  InboxSourceUpdateInput,
  State,
} from '@evidence/api-client';
import { useResource } from '@evidence/api-client';
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
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  MessageResponse,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@evidence/ui';
import { InboxPagination } from './inbox-pagination';

const inboxStatuses: InboxItemStatus[] = ['active', 'deferred', 'closed'];

export function InboxItemDetailView({
  resourceState,
  children,
}: {
  resourceState: State<InboxItemResource>;
  children?: ReactNode;
}) {
  const [itemState, setItemState] = useState(resourceState);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [statusPending, setStatusPending] = useState(false);
  const revisionsResource = useMemo(
    () => itemState.follow('revisions'),
    [itemState],
  );
  const latestRevisionResource = useMemo(
    () => itemState.follow('latest-revision'),
    [itemState],
  );
  const revisions =
    useResource<InboxRevisionCollectionResource>(revisionsResource);
  const latestRevision = useResource<InboxRevisionResource>(
    latestRevisionResource,
  );
  const item = itemState.data;

  const changeStatus = async (status: InboxItemStatus) => {
    if (status === item.status || statusPending) {
      return;
    }

    setStatusPending(true);
    setMutationError(null);
    try {
      const input: InboxItemStatusInput = {
        status,
        expectedVersion: item.version,
      };
      const updated = await itemState.follow('self').patch({ data: input });
      setItemState(updated);
    } catch (caught) {
      setMutationError(
        errorMessage(caught, 'The Inbox status could not be changed.'),
      );
    } finally {
      setStatusPending(false);
    }
  };

  const updateSource = async (input: InboxSourceUpdateInput) => {
    setMutationError(null);
    await revisionsResource.post({ data: input });

    try {
      const [updatedItem] = await Promise.all([
        itemState.follow('self').refresh(),
        revisionsResource.refresh(),
      ]);
      setItemState(updatedItem);
    } catch (caught) {
      setMutationError(
        `The source was updated, but the page could not refresh: ${errorMessage(
          caught,
          'refresh failed',
        )}`,
      );
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle aria-level={1} role="heading">
                {item.title}
              </CardTitle>
              <StatusBadge status={item.status} />
            </div>
            <CardDescription>
              {formatLabel(item.sourceKind)} source · {item.revisionCount}{' '}
              {item.revisionCount === 1 ? 'revision' : 'revisions'}
            </CardDescription>
          </div>
          {children ||
          (!latestRevision.loading &&
            latestRevision.resourceState &&
            isManualSource(item.sourceKind)) ? (
            <div className="flex flex-wrap gap-2">
              {!latestRevision.loading &&
              latestRevision.resourceState &&
              isManualSource(item.sourceKind) ? (
                <EditSourceDialog
                  expectedLatestRevisionSha256={item.latestRevisionSha256}
                  latestRevisionState={latestRevision.resourceState}
                  onUpdate={updateSource}
                />
              ) : null}
              {children}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailItem
              label="Created"
              value={formatDateTime(item.createdAt)}
            />
            <DetailItem
              label="Updated"
              value={formatDateTime(item.updatedAt)}
            />
          </div>
          <Separator />
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Status</p>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Inbox status"
            >
              {inboxStatuses.map((status) => (
                <Button
                  key={status}
                  aria-label={`Mark ${status}`}
                  aria-pressed={item.status === status}
                  disabled={statusPending || item.status === status}
                  size="sm"
                  type="button"
                  variant={item.status === status ? 'default' : 'outline'}
                  onClick={() => void changeStatus(status)}
                >
                  {formatLabel(status)}
                </Button>
              ))}
            </div>
          </div>
          {mutationError ? (
            <Alert variant="destructive">
              <AlertDescription>{mutationError}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <RelatedResourceCard
        title="Latest revision"
        description="The current immutable source snapshot."
        loading={latestRevision.loading}
        error={latestRevision.error}
      >
        {latestRevision.resourceState ? (
          <InboxRevisionContent revisionState={latestRevision.resourceState} />
        ) : null}
      </RelatedResourceCard>

      <RelatedResourceCard
        title="Revision history"
        description="Every distinct source snapshot captured for this Inbox item."
        loading={revisions.loading}
        error={revisions.error}
        count={revisions.resourceState?.data.page.totalElements}
      >
        {revisions.resourceState ? (
          <PaginatedRevisionTimeline
            key={item.latestRevisionId}
            latestRevisionId={item.latestRevisionId}
            resourceState={revisions.resourceState}
          />
        ) : null}
      </RelatedResourceCard>
    </div>
  );
}

export function InboxRevisionCollectionView({
  resourceState,
}: {
  resourceState: State<InboxRevisionCollectionResource>;
}) {
  return (
    <RelatedResourceCard
      title="Revision history"
      description="Every distinct source snapshot captured for this Inbox item."
      loading={false}
      error={null}
      count={resourceState.data.page.totalElements}
    >
      <PaginatedRevisionTimeline resourceState={resourceState} />
    </RelatedResourceCard>
  );
}

export function InboxRevisionDetailView({
  resourceState,
}: {
  resourceState: State<InboxRevisionResource>;
}) {
  const revision = resourceState.data;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Revision {revision.revisionNumber}</Badge>
          <Badge variant="outline">
            {contentTypeLabel(revision.contentType)}
          </Badge>
        </div>
        <CardTitle aria-level={1} role="heading">
          {revision.title}
        </CardTitle>
        <CardDescription>
          Captured {formatDateTime(revision.capturedAt)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <InboxRevisionContent revisionState={resourceState} />
      </CardContent>
    </Card>
  );
}

function EditSourceDialog({
  expectedLatestRevisionSha256,
  latestRevisionState,
  onUpdate,
}: {
  expectedLatestRevisionSha256: string;
  latestRevisionState: State<InboxRevisionResource>;
  onUpdate: (input: InboxSourceUpdateInput) => Promise<void>;
}) {
  const latest = latestRevisionState.data;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(latest.title);
  const [body, setBody] = useState(latest.body);
  const [contentType, setContentType] = useState<
    InboxSourceUpdateInput['contentType']
  >(latest.contentType);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle(latest.title);
    setBody(latest.body);
    setContentType(latest.contentType);
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (!normalizedTitle || !body.trim() || pending) {
      return;
    }

    setPending(true);
    setError(null);
    try {
      await onUpdate({
        title: normalizedTitle,
        body,
        contentType,
        expectedLatestRevisionSha256,
      });
      setOpen(false);
    } catch (caught) {
      setError(errorMessage(caught, 'The source could not be updated.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) {
          if (nextOpen) {
            reset();
          }
          setOpen(nextOpen);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>Edit source</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit source</DialogTitle>
          <DialogDescription>
            Saving changed content automatically records an immutable revision.
            Unchanged content is not duplicated.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="revision-title">Title</FieldLabel>
              <Input
                id="revision-title"
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="revision-content-type">
                Content type
              </FieldLabel>
              <Select
                value={contentType}
                onValueChange={(value) =>
                  setContentType(value as InboxSourceUpdateInput['contentType'])
                }
              >
                <SelectTrigger id="revision-content-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="text/markdown">Markdown</SelectItem>
                    <SelectItem value="text/plain">Plain text</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                The source representation is preserved with each revision.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="revision-body">Content</FieldLabel>
              <Textarea
                id="revision-body"
                className="min-h-60 resize-y font-mono text-sm"
                required
                value={body}
                onChange={(event) => setBody(event.target.value)}
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
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={
                pending || title.trim().length === 0 || body.trim().length === 0
              }
              type="submit"
            >
              {pending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PaginatedRevisionTimeline({
  latestRevisionId,
  resourceState,
}: {
  latestRevisionId?: string;
  resourceState: State<InboxRevisionCollectionResource>;
}) {
  const [pageState, setPageState] = useState(resourceState);
  const [pagePending, setPagePending] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const navigatePage = async (relation: 'prev' | 'next') => {
    if (!pageState.getLink(relation) || pagePending) {
      return;
    }
    setPagePending(true);
    setPageError(null);
    try {
      setPageState(await pageState.follow(relation).refresh());
    } catch (caught) {
      setPageError(
        errorMessage(caught, 'The revision page could not be loaded.'),
      );
    } finally {
      setPagePending(false);
    }
  };

  return (
    <>
      {pageError ? (
        <Alert className="mb-3" variant="destructive">
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      ) : null}
      <RevisionTimeline
        latestRevisionId={latestRevisionId}
        resourceState={pageState}
      />
      <InboxPagination
        label="Inbox revision pages"
        page={pageState.data.page.number}
        totalPages={pageState.data.page.totalPages}
        hasPrevious={Boolean(pageState.getLink('prev'))}
        hasNext={Boolean(pageState.getLink('next'))}
        pending={pagePending}
        onPrevious={() => void navigatePage('prev')}
        onNext={() => void navigatePage('next')}
      />
    </>
  );
}

function RevisionTimeline({
  latestRevisionId,
  resourceState,
}: {
  latestRevisionId?: string;
  resourceState: State<InboxRevisionCollectionResource>;
}) {
  if (resourceState.collection.length === 0) {
    return (
      <Empty className="py-8">
        <EmptyHeader>
          <EmptyTitle>No revisions found</EmptyTitle>
          <EmptyDescription>
            This Inbox item does not expose a source snapshot yet.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Revision</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Captured</TableHead>
            <TableHead>Content hash</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {resourceState.collection.map((revisionState) => {
            const revision = revisionState.data;
            const href = revisionState.getLink('self')?.href;
            return (
              <TableRow key={revision.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium tabular-nums">
                      #{revision.revisionNumber}
                    </span>
                    {revision.id === latestRevisionId ? (
                      <Badge variant="secondary">Latest</Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="min-w-48">{revision.title}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDateTime(revision.capturedAt)}
                </TableCell>
                <TableCell className="max-w-48 truncate font-mono text-xs">
                  {revision.contentSha256}
                </TableCell>
                <TableCell className="text-right">
                  {href ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to={href}>Open</Link>
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function InboxRevisionContent({
  revisionState,
}: {
  revisionState: State<InboxRevisionResource>;
}) {
  const revision = revisionState.data;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DetailItem label="Revision" value={`#${revision.revisionNumber}`} />
        <DetailItem
          label="Content type"
          value={contentTypeLabel(revision.contentType)}
        />
        <DetailItem
          label="Captured"
          value={formatDateTime(revision.capturedAt)}
        />
        <DetailItem
          label="Source updated"
          value={
            revision.sourceUpdatedAt
              ? formatDateTime(revision.sourceUpdatedAt)
              : '—'
          }
        />
        <DetailItem
          className="sm:col-span-2 xl:col-span-4"
          label="SHA-256"
          value={revision.contentSha256}
          mono
        />
        {revision.uri ? (
          <DetailItem
            className="sm:col-span-2 xl:col-span-4"
            label="Source URI"
            value={revision.uri}
            mono
          />
        ) : null}
      </div>
      <Separator />
      <div>
        <p className="mb-3 text-sm font-medium">Content</p>
        {revision.body.trim() ? (
          revision.contentType === 'text/markdown' ? (
            <MessageResponse className="text-sm text-foreground [&>*+*]:mt-3 [&_a]:font-medium [&_a]:text-primary [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0">
              {revision.body}
            </MessageResponse>
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {revision.body}
            </p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">No source content.</p>
        )}
      </div>
    </div>
  );
}

function RelatedResourceCard({
  title,
  description,
  loading,
  error,
  count,
  children,
}: {
  title: string;
  description: string;
  loading: boolean;
  error: Error | null;
  count?: number;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle aria-level={2} role="heading">
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {count !== undefined ? (
          <Badge variant="secondary">{count} total</Badge>
        ) : null}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function DetailItem({
  label,
  value,
  mono = false,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-sm font-medium">{label}</p>
      <p
        className={`mt-1 break-words text-sm text-muted-foreground${
          mono ? ' font-mono text-xs' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: InboxItemStatus }) {
  const variant =
    status === 'active'
      ? 'default'
      : status === 'deferred'
        ? 'secondary'
        : 'outline';
  return <Badge variant={variant}>{formatLabel(status)}</Badge>;
}

function isManualSource(sourceKind: string): boolean {
  return sourceKind === 'manual_text';
}

function contentTypeLabel(contentType: string) {
  return contentType === 'text/markdown' ? 'Markdown' : 'Plain text';
}

function formatLabel(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
