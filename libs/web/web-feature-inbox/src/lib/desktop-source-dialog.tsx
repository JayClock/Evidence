import { useState, type FormEvent } from 'react';
import type { InboxSourceInput } from '@evidence/api-client';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
} from '@evidence/ui';

type AdapterKind = 'local_markdown' | 'github_issue';
type DesktopBridge = NonNullable<Window['evidenceDesktop']>;
type MarkdownAdapter = NonNullable<DesktopBridge['readInboxMarkdown']>;
type GitHubAdapter = NonNullable<DesktopBridge['fetchInboxGitHubIssue']>;

export function DesktopSourceDialog({
  workspaceId,
  onCapture,
}: {
  workspaceId: string | null;
  onCapture: (input: InboxSourceInput) => Promise<void>;
}) {
  const bridge = window.evidenceDesktop;
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<AdapterKind>('local_markdown');
  const [relativePath, setRelativePath] = useState('');
  const [owner, setOwner] = useState('');
  const [repository, setRepository] = useState('');
  const [issueNumber, setIssueNumber] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready =
    kind === 'local_markdown'
      ? Boolean(bridge?.readInboxMarkdown && workspaceId && relativePath.trim())
      : Boolean(
          bridge?.fetchInboxGitHubIssue &&
            owner.trim() &&
            repository.trim() &&
            Number.isSafeInteger(Number(issueNumber)) &&
            Number(issueNumber) > 0,
        );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!bridge || !ready || pending) return;
    setPending(true);
    setError(null);
    try {
      const source =
        kind === 'local_markdown'
          ? await requiredMarkdownAdapter(bridge.readInboxMarkdown)(
              requiredWorkspaceId(workspaceId),
              relativePath.trim(),
            )
          : await requiredGitHubAdapter(bridge.fetchInboxGitHubIssue)(
              owner.trim(),
              repository.trim(),
              Number(issueNumber),
            );
      await onCapture(source);
      reset();
      setOpen(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  const reset = () => {
    setRelativePath('');
    setOwner('');
    setRepository('');
    setIssueNumber('');
    setError(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) {
          if (!nextOpen) reset();
          setOpen(nextOpen);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          disabled={
            !bridge?.readInboxMarkdown && !bridge?.fetchInboxGitHubIssue
          }
          variant="outline"
        >
          Capture Desktop source
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Capture Desktop source</DialogTitle>
          <DialogDescription>
            Read a repository-relative Markdown file or GitHub Issue locally,
            then send only the provider-neutral source snapshot to Evidence.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="desktop-source-kind">Source</FieldLabel>
              <Select
                value={kind}
                onValueChange={(value) => setKind(value as AdapterKind)}
              >
                <SelectTrigger id="desktop-source-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="local_markdown">
                      Repository Markdown
                    </SelectItem>
                    <SelectItem value="github_issue">GitHub Issue</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {kind === 'local_markdown' ? (
              <Field>
                <FieldLabel htmlFor="desktop-markdown-path">
                  Repository-relative path
                </FieldLabel>
                <Input
                  id="desktop-markdown-path"
                  placeholder="docs/request.md"
                  required
                  value={relativePath}
                  onChange={(event) => setRelativePath(event.target.value)}
                />
                <FieldDescription>
                  Absolute paths and files outside the bound repository are
                  rejected and never sent to the Server.
                </FieldDescription>
              </Field>
            ) : (
              <>
                <Field>
                  <FieldLabel htmlFor="github-owner">Owner</FieldLabel>
                  <Input
                    id="github-owner"
                    required
                    value={owner}
                    onChange={(event) => setOwner(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="github-repository">
                    Repository
                  </FieldLabel>
                  <Input
                    id="github-repository"
                    required
                    value={repository}
                    onChange={(event) => setRepository(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="github-issue-number">
                    Issue number
                  </FieldLabel>
                  <Input
                    id="github-issue-number"
                    min={1}
                    required
                    type="number"
                    value={issueNumber}
                    onChange={(event) => setIssueNumber(event.target.value)}
                  />
                </Field>
              </>
            )}
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
            <Button disabled={!ready || pending} type="submit">
              {pending ? 'Capturing…' : 'Capture snapshot'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function requiredMarkdownAdapter(
  adapter: MarkdownAdapter | undefined,
): MarkdownAdapter {
  if (!adapter) throw new Error('Desktop Markdown adapter is unavailable.');
  return adapter;
}

function requiredGitHubAdapter(
  adapter: GitHubAdapter | undefined,
): GitHubAdapter {
  if (!adapter) throw new Error('Desktop GitHub adapter is unavailable.');
  return adapter;
}

function requiredWorkspaceId(value: string | null): string {
  if (!value) throw new Error('The Inbox is missing its Workspace relation.');
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The Desktop source could not be captured.';
}
