import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  Separator,
  SidebarTrigger,
} from '@evidence/ui';
import { SearchIcon } from 'lucide-react';

import type { ShellNavigationSection } from './navigation';

interface BreadcrumbEntry {
  href?: string;
  label: string;
}

export function AppTopbar({
  activeWorkspaceTitle,
  navigation,
}: {
  activeWorkspaceTitle?: string;
  navigation: ShellNavigationSection[];
}) {
  const location = useLocation();
  const [commandOpen, setCommandOpen] = useState(false);
  const breadcrumbs = useMemo(
    () => breadcrumbEntries(location.pathname, activeWorkspaceTitle),
    [activeWorkspaceTitle, location.pathname],
  );

  useEffect(() => {
    const openCommand = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener('keydown', openCommand);
    return () => window.removeEventListener('keydown', openCommand);
  }, []);

  const desktopConnected =
    typeof window !== 'undefined' && Boolean(window.evidenceDesktop);

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-3.5">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-5" />
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap overflow-hidden">
            {breadcrumbs.map((entry, index) => {
              const current = index === breadcrumbs.length - 1;
              return (
                <Fragment key={`${entry.label}-${index}`}>
                  {index > 0 ? <BreadcrumbSeparator /> : null}
                  <BreadcrumbItem>
                    {current || !entry.href ? (
                      <BreadcrumbPage className="truncate">
                        {entry.label}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link className="truncate" to={entry.href}>
                          {entry.label}
                        </Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
        <div className="min-w-0 flex-1" />
        <Button
          aria-label="搜索工作区或执行命令"
          className="hidden w-64 justify-start text-muted-foreground lg:flex"
          onClick={() => setCommandOpen(true)}
          type="button"
          variant="outline"
        >
          <SearchIcon data-icon="inline-start" />
          <span className="truncate">搜索工作区或执行命令</span>
          <kbd className="ml-auto font-mono text-[0.625rem]">⌘K</kbd>
        </Button>
        <Button
          aria-label="搜索工作区或执行命令"
          className="lg:hidden"
          onClick={() => setCommandOpen(true)}
          size="icon"
          type="button"
          variant="outline"
        >
          <SearchIcon />
        </Button>
        <Badge variant="secondary">
          {desktopConnected ? 'Desktop · 已连接' : 'Web · 查看模式'}
        </Badge>
      </header>
      <NavigationCommand
        navigation={navigation}
        open={commandOpen}
        onOpenChange={setCommandOpen}
      />
    </>
  );
}

function NavigationCommand({
  navigation,
  open,
  onOpenChange,
}: {
  navigation: ShellNavigationSection[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  return (
    <CommandDialog
      description="搜索并打开当前工作区中的页面。"
      onOpenChange={onOpenChange}
      open={open}
      title="工作区命令"
    >
      <Command>
        <CommandInput placeholder="搜索页面或命令…" />
        <CommandList>
          <CommandEmpty>没有匹配的页面。</CommandEmpty>
          {navigation.map((section) => (
            <CommandGroup heading={section.title} key={section.key}>
              {section.items.map((item) => (
                <CommandItem
                  key={item.key}
                  onSelect={() => {
                    navigate(item.href);
                    onOpenChange(false);
                  }}
                  value={`${section.title} ${item.label}`}
                >
                  <span>{item.label}</span>
                  <CommandShortcut>{section.title}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

function breadcrumbEntries(
  pathname: string,
  workspaceTitle?: string,
): BreadcrumbEntry[] {
  const appPath = pathname.startsWith('/api/')
    ? pathname.slice('/api'.length)
    : pathname;
  const match = appPath.match(/^\/workspaces\/([^/]+)(?:\/(.*))?$/);
  if (!match) return [{ label: 'Evidence' }];

  const workspaceId = match[1] ?? '';
  const base = `/workspaces/${workspaceId}`;
  const tail = match[2]?.split('/').filter(Boolean) ?? [];
  const entries: BreadcrumbEntry[] = [
    { href: base, label: workspaceTitle ?? '工作区' },
  ];
  if (tail.length === 0) return [...entries, { label: '总览' }];

  const first = tail[0];
  const known: Record<string, [string, string]> = {
    'inbox-items': ['工作区', '收件箱'],
    'story-candidates': ['交付', '故事候选'],
    stories: ['交付', '故事看板'],
    iterations: ['交付', 'Iteration'],
    diagram: ['模型', '模型图'],
    'logical-entities': ['模型', '逻辑实体'],
  };
  const labels = known[first ?? ''];
  if (!labels) return [...entries, { label: humanize(first ?? '') }];

  entries.push({ label: labels[0] });
  if (first === 'iterations' && tail[1]) {
    entries.push({ label: decodeURIComponent(tail[1]) });
    if (tail[2]) entries.push({ label: humanize(tail[2]) });
    return entries;
  }
  if (tail.length > 1) {
    entries.push({ href: `${base}/${first}`, label: labels[1] });
    entries.push({ label: decodeURIComponent(tail.at(-1) ?? '') });
    return entries;
  }
  entries.push({ label: labels[1] });
  return entries;
}

function humanize(value: string): string {
  const labels: Record<string, string> = {
    kickoff: 'Kickoff',
    intake: 'Frozen Intake',
    understanding: 'Understand / TQA',
    tasking: 'Tasking / Desk Check',
    pair: 'Pair 工作台',
    revisions: '修订历史',
  };
  return labels[value] ?? value.replaceAll('-', ' ');
}
