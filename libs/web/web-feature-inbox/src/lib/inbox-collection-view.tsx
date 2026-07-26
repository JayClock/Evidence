import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type {
  InboxItemCollectionResource,
  InboxItemResource,
  InboxSourceInput,
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
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@evidence/ui';
import { DesktopSourceDialog } from './desktop-source-dialog';
import { InboxExtractionControls } from './inbox-extraction-controls';
import { InboxPagination } from './inbox-pagination';

export function InboxCollectionView({
  resourceState,
}: {
  resourceState: State<InboxItemCollectionResource>;
}) {
  const [collectionState, setCollectionState] = useState(resourceState);
  const [pagePending, setPagePending] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelection = (itemId: string, selected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) {
        if (next.size < 5) next.add(itemId);
      } else {
        next.delete(itemId);
      }
      return next;
    });
  };

  const capture = async (input: InboxSourceInput) => {
    const collection = collectionState.follow('self');
    await collection.post({ data: input });
    const refreshed =
      (await collection.refresh()) as State<InboxItemCollectionResource>;
    setCollectionState(refreshed);
  };

  const navigatePage = async (relation: 'prev' | 'next') => {
    if (!collectionState.getLink(relation) || pagePending) {
      return;
    }
    setPagePending(true);
    setPageError(null);
    try {
      const nextState = await collectionState.follow(relation).refresh();
      setCollectionState(nextState);
    } catch (caught) {
      setPageError(errorMessage(caught));
    } finally {
      setPagePending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle aria-level={2} role="heading">
            Inbox
          </CardTitle>
          <CardDescription>
            Capture source material before it becomes modeled evidence or a
            delivery Story.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-2">
          <InboxExtractionControls
            collectionState={collectionState}
            selectedIds={[...selectedIds]}
          />
          <DesktopSourceDialog
            workspaceId={workspaceId(collectionState)}
            onCapture={capture}
          />
          <CaptureInboxDialog onCapture={capture} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Workspace source records and their immutable revision history.
          </p>
          <Badge variant="secondary">
            {collectionState.data.page.totalElements} total
          </Badge>
        </div>
        {pageError ? (
          <Alert className="mb-3" variant="destructive">
            <AlertDescription>{pageError}</AlertDescription>
          </Alert>
        ) : null}
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Select</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Revisions</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {collectionState.collection.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Empty className="py-8">
                      <EmptyHeader>
                        <EmptyTitle>No inbox items yet</EmptyTitle>
                        <EmptyDescription>
                          Capture a Markdown or plain-text source to begin.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                collectionState.collection.map((itemState) => (
                  <InboxItemRow
                    key={itemState.data.id}
                    itemState={itemState}
                    selected={selectedIds.has(itemState.data.id)}
                    selectionLimitReached={selectedIds.size >= 5}
                    onSelectionChange={toggleSelection}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <InboxPagination
          label="Inbox pages"
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

function InboxItemRow({
  itemState,
  selected,
  selectionLimitReached,
  onSelectionChange,
}: {
  itemState: State<InboxItemResource>;
  selected: boolean;
  selectionLimitReached: boolean;
  onSelectionChange: (itemId: string, selected: boolean) => void;
}) {
  const item = itemState.data;
  const href = itemState.getLink('self')?.href;
  const selectable = item.status === 'active';

  return (
    <TableRow>
      <TableCell>
        <input
          aria-label={`Select ${item.title}`}
          checked={selected}
          className="size-4 accent-primary"
          disabled={!selectable || (selectionLimitReached && !selected)}
          type="checkbox"
          onChange={(event) =>
            onSelectionChange(item.id, event.currentTarget.checked)
          }
        />
      </TableCell>
      <TableCell className="min-w-56 font-medium">{item.title}</TableCell>
      <TableCell>
        <StatusBadge status={item.status} />
      </TableCell>
      <TableCell className="font-mono text-xs">{item.sourceKind}</TableCell>
      <TableCell className="text-right tabular-nums">
        {item.revisionCount}
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {formatDateTime(item.updatedAt)}
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
}

function CaptureInboxDialog({
  onCapture,
}: {
  onCapture: (input: InboxSourceInput) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [contentType, setContentType] =
    useState<InboxSourceInput['contentType']>('text/markdown');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle('');
    setBody('');
    setContentType('text/markdown');
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
      await onCapture({
        sourceKind: 'manual_text',
        externalKey: createManualSourceKey(),
        title: normalizedTitle,
        body,
        contentType,
      });
      reset();
      setOpen(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) {
          if (!nextOpen) {
            reset();
          }
          setOpen(nextOpen);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>Capture source</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Capture source</DialogTitle>
          <DialogDescription>
            Add a manual text source to this workspace Inbox. The server will
            create its first immutable revision.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="inbox-title">Title</FieldLabel>
              <Input
                id="inbox-title"
                autoFocus
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="inbox-content-type">Content type</FieldLabel>
              <Select
                value={contentType}
                onValueChange={(value) =>
                  setContentType(value as InboxSourceInput['contentType'])
                }
              >
                <SelectTrigger id="inbox-content-type" className="w-full">
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
                Markdown is stored as source text and rendered only when read.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="inbox-body">Content</FieldLabel>
              <Textarea
                id="inbox-body"
                className="min-h-52 resize-y font-mono text-sm"
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
              {pending ? 'Capturing…' : 'Capture'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'active'
      ? 'default'
      : status === 'deferred'
        ? 'secondary'
        : 'outline';

  return <Badge variant={variant}>{formatLabel(status)}</Badge>;
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

function workspaceId(
  collectionState: State<InboxItemCollectionResource>,
): string | null {
  const href = collectionState.getLink('workspace')?.href;
  const match = href && /\/workspaces\/([^/?#]+)/.exec(href);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function createManualSourceKey() {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  return `manual:${randomUuid ?? `${Date.now()}-${Math.random()}`}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'The source could not be captured.';
}
