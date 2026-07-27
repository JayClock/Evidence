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
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from '@evidence/ui';

type SourceMethod = 'manual_text' | 'local_markdown' | 'github_issue';
type DesktopBridge = NonNullable<Window['evidenceDesktop']>;
type MarkdownAdapter = NonNullable<DesktopBridge['readInboxMarkdown']>;
type GitHubAdapter = NonNullable<DesktopBridge['fetchInboxGitHubIssue']>;

export function InboxSourceDialog({
  workspaceId,
  onCapture,
}: {
  workspaceId: string | null;
  onCapture: (input: InboxSourceInput) => Promise<void>;
}) {
  const bridge = window.evidenceDesktop;
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<SourceMethod>('manual_text');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [contentType, setContentType] =
    useState<InboxSourceInput['contentType']>('text/markdown');
  const [relativePath, setRelativePath] = useState('');
  const [owner, setOwner] = useState('');
  const [repository, setRepository] = useState('');
  const [issueNumber, setIssueNumber] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready =
    method === 'manual_text'
      ? Boolean(title.trim() && body.trim())
      : method === 'local_markdown'
        ? Boolean(
            bridge?.readInboxMarkdown && workspaceId && relativePath.trim(),
          )
        : Boolean(
            bridge?.fetchInboxGitHubIssue &&
              owner.trim() &&
              repository.trim() &&
              Number.isSafeInteger(Number(issueNumber)) &&
              Number(issueNumber) > 0,
          );

  const reset = () => {
    setMethod('manual_text');
    setTitle('');
    setBody('');
    setContentType('text/markdown');
    setRelativePath('');
    setOwner('');
    setRepository('');
    setIssueNumber('');
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || pending) return;

    setPending(true);
    setError(null);
    try {
      const source =
        method === 'manual_text'
          ? {
              sourceKind: 'manual_text',
              externalKey: createManualSourceKey(),
              title: title.trim(),
              body,
              contentType,
            }
          : method === 'local_markdown'
            ? await requiredMarkdownAdapter(bridge?.readInboxMarkdown)(
                requiredWorkspaceId(workspaceId),
                relativePath.trim(),
              )
            : await requiredGitHubAdapter(bridge?.fetchInboxGitHubIssue)(
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
        <Button>添加来源</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>添加来源</DialogTitle>
          <DialogDescription>
            手工录入，或在 Desktop 中从仓库 Markdown、GitHub Issue
            创建不可变来源快照。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field>
              <FieldLabel id="inbox-source-method">添加方式</FieldLabel>
              <ToggleGroup
                aria-labelledby="inbox-source-method"
                className="w-full flex-wrap justify-start"
                type="single"
                value={method}
                variant="outline"
                onValueChange={(value) => {
                  if (value) {
                    setMethod(value as SourceMethod);
                    setError(null);
                  }
                }}
              >
                <ToggleGroupItem className="flex-1" value="manual_text">
                  手工录入
                </ToggleGroupItem>
                <ToggleGroupItem
                  className="flex-1"
                  disabled={!bridge?.readInboxMarkdown || !workspaceId}
                  value="local_markdown"
                >
                  仓库 Markdown
                </ToggleGroupItem>
                <ToggleGroupItem
                  className="flex-1"
                  disabled={!bridge?.fetchInboxGitHubIssue}
                  value="github_issue"
                >
                  GitHub Issue
                </ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>
                手工录入适用于 Web 与 Desktop；其他方式使用本地 Desktop 能力。
              </FieldDescription>
            </Field>

            {method === 'manual_text' ? (
              <>
                <Field>
                  <FieldLabel htmlFor="inbox-title">标题</FieldLabel>
                  <Input
                    id="inbox-title"
                    autoFocus
                    required
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="inbox-content-type">内容类型</FieldLabel>
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
                        <SelectItem value="text/plain">纯文本</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    原始文本会保存在不可变 Revision 中；读取时再进行渲染。
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="inbox-body">正文</FieldLabel>
                  <Textarea
                    id="inbox-body"
                    className="min-h-52 resize-y font-mono text-sm"
                    required
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                  />
                </Field>
              </>
            ) : method === 'local_markdown' ? (
              <Field>
                <FieldLabel htmlFor="desktop-markdown-path">
                  仓库相对路径
                </FieldLabel>
                <Input
                  id="desktop-markdown-path"
                  autoFocus
                  placeholder="docs/request.md"
                  required
                  value={relativePath}
                  onChange={(event) => setRelativePath(event.target.value)}
                />
                <FieldDescription>
                  绝对路径及绑定仓库之外的文件会被拒绝，且不会发送到 Server。
                </FieldDescription>
              </Field>
            ) : (
              <>
                <Field>
                  <FieldLabel htmlFor="github-owner">所有者</FieldLabel>
                  <Input
                    id="github-owner"
                    autoFocus
                    required
                    value={owner}
                    onChange={(event) => setOwner(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="github-repository">仓库</FieldLabel>
                  <Input
                    id="github-repository"
                    required
                    value={repository}
                    onChange={(event) => setRepository(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="github-issue-number">
                    Issue 编号
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
                取消
              </Button>
            </DialogClose>
            <Button disabled={!ready || pending} type="submit">
              {pending ? '添加中…' : '保存来源'}
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
  if (!adapter) throw new Error('Desktop Markdown adapter 不可用。');
  return adapter;
}

function requiredGitHubAdapter(
  adapter: GitHubAdapter | undefined,
): GitHubAdapter {
  if (!adapter) throw new Error('Desktop GitHub adapter 不可用。');
  return adapter;
}

function requiredWorkspaceId(value: string | null): string {
  if (!value) throw new Error('Inbox 缺少 Workspace relation。');
  return value;
}

function createManualSourceKey() {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  return `manual:${randomUuid ?? `${Date.now()}-${Math.random()}`}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '无法添加来源。';
}
