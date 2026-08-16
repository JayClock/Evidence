import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
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
  EvidenceStatusBadge,
  Separator,
  SidebarTrigger,
} from '@evidence/ui';
import { MoonIcon, SearchIcon, SunIcon } from 'lucide-react';

import type { ShellNavigationSection } from './navigation';

interface BreadcrumbEntry {
  href?: string;
  label: string;
}

export function AppTopbar({
  navigation,
}: {
  navigation: ShellNavigationSection[];
}) {
  const location = useLocation();
  const [commandOpen, setCommandOpen] = useState(false);
  const breadcrumbs = useMemo(
    () => breadcrumbEntries(location.pathname),
    [location.pathname],
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
      <header className="flex h-11 shrink-0 items-center gap-2 border-b bg-card px-3">
        <SidebarTrigger className="lg:hidden" />
        <Separator orientation="vertical" className="h-5 lg:hidden" />
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
          size="sm"
          type="button"
          variant="outline"
        >
          <SearchIcon aria-hidden data-icon="inline-start" />
          <span className="truncate">搜索或跳转</span>
          <kbd className="ml-auto font-mono text-[0.6875rem]">⌘K</kbd>
        </Button>
        <Button
          aria-label="搜索工作区或执行命令"
          className="lg:hidden"
          onClick={() => setCommandOpen(true)}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <SearchIcon aria-hidden />
        </Button>
        {requiresDesktopStatus(location.pathname) ? (
          <EvidenceStatusBadge
            label={desktopConnected ? 'Desktop · 已连接' : 'Web · 查看模式'}
            status={desktopConnected ? 'verified' : 'locked'}
          />
        ) : null}
        <ThemeToggle />
      </header>
      <NavigationCommand
        navigation={navigation}
        open={commandOpen}
        onOpenChange={setCommandOpen}
      />
    </>
  );
}

type Theme = 'light' | 'dark';

const themeStorageKey = 'evidence-theme';

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const dark = theme === 'dark';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(themeStorageKey, theme);
  }, [dark, theme]);

  return (
    <Button
      aria-label={dark ? '切换到浅色模式' : '切换到深色模式'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      {dark ? <SunIcon aria-hidden /> : <MoonIcon aria-hidden />}
    </Button>
  );
}

function initialTheme(): Theme {
  const saved = window.localStorage.getItem(themeStorageKey);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
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

function breadcrumbEntries(pathname: string): BreadcrumbEntry[] {
  const appPath = canonicalPath(pathname);
  const match = appPath.match(/^\/workspaces\/([^/]+)(?:\/(.*))?$/);
  if (!match) return [{ label: 'Evidence' }];

  const workspaceId = match[1] ?? '';
  const base = `/workspaces/${workspaceId}`;
  const tail = match[2]?.split('/').filter(Boolean) ?? [];
  const first = tail[0];

  if (!first) {
    return [{ href: base, label: '工作区' }, { label: '总览' }];
  }

  if (first === 'inbox-items') {
    return collectionBreadcrumb(
      base,
      first,
      '知识交付',
      'Problem 与 Intake',
      tail,
      '来源详情',
    );
  }
  if (first === 'story-candidates') {
    return collectionBreadcrumb(
      base,
      first,
      'Problem 与 Intake',
      'Candidate 提案',
      tail,
      'Candidate',
    );
  }
  if (first === 'stories') {
    return tail.length === 1
      ? [{ label: '知识交付' }, { label: '交付位置' }]
      : [
          { href: `${base}/stories`, label: '交付位置' },
          { label: tail.includes('revisions') ? 'Story Revision' : 'Story' },
        ];
  }
  if (first === 'iterations') {
    return iterationBreadcrumb(base, tail[2]);
  }
  if (first === 'diagram') {
    return [{ label: '领域知识' }, { label: 'Scenario 与 Model' }];
  }
  if (first === 'logical-entities') {
    return collectionBreadcrumb(
      base,
      first,
      '模型',
      '逻辑实体',
      tail,
      '实体详情',
    );
  }

  return [{ href: base, label: '工作区' }, { label: '资源' }];
}

function collectionBreadcrumb(
  base: string,
  segment: string,
  parent: string,
  collection: string,
  tail: string[],
  detail: string,
): BreadcrumbEntry[] {
  if (tail.length === 1) return [{ label: parent }, { label: collection }];
  return [
    { href: `${base}/${segment}`, label: collection },
    { label: tail.includes('revisions') ? '修订历史' : detail },
  ];
}

function iterationBreadcrumb(
  base: string,
  activity?: string,
): BreadcrumbEntry[] {
  const labels: Record<string, [string, string]> = {
    kickoff: ['Problem 与 Intake', 'Kickoff'],
    intake: ['Problem 与 Intake', 'Frozen Intake'],
    understanding: ['Scenario 与 Model', 'Understand / TQA'],
    tasking: ['Tasking', 'Desk Check'],
    pair: ['Pair', 'Story 级编码审批'],
    showcase: ['Showcase', '价值验证'],
    respond: ['Run 与 Respond', '知识响应'],
  };
  const [parent, current] = labels[activity ?? ''] ?? ['知识交付', 'Iteration'];
  const parentHref =
    activity === 'understanding' ||
    activity === 'showcase' ||
    activity === 'respond'
      ? `${base}/stories`
      : activity === 'tasking'
        ? `${base}/stories?filter=tasking`
        : activity === 'pair'
          ? `${base}/stories?filter=pair`
          : undefined;
  return [{ href: parentHref, label: parent }, { label: current }];
}

function requiresDesktopStatus(pathname: string): boolean {
  const appPath = canonicalPath(pathname);
  return (
    appPath.endsWith('/understanding') ||
    appPath.endsWith('/tasking') ||
    appPath.endsWith('/pair') ||
    appPath.endsWith('/showcase') ||
    appPath.endsWith('/respond') ||
    /\/workspaces\/[^/]+\/stories\/?$/.test(appPath)
  );
}

function canonicalPath(pathname: string): string {
  return pathname.startsWith('/api/')
    ? pathname.slice('/api'.length)
    : pathname;
}
