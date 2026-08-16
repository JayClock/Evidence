import * as React from 'react';

import { cn } from '../lib/utils';

function EvidencePage({
  className,
  ...props
}: React.ComponentProps<'section'>) {
  return (
    <section
      data-slot="evidence-page"
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden bg-card text-card-foreground',
        className,
      )}
      {...props}
    />
  );
}

function EvidenceCanvas({
  className,
  ...props
}: React.ComponentProps<'section'>) {
  return (
    <section
      data-slot="evidence-canvas"
      className={cn(
        'flex h-full min-h-0 flex-col overflow-y-auto bg-card text-foreground',
        className,
      )}
      {...props}
    />
  );
}

function PageHeader({ className, ...props }: React.ComponentProps<'header'>) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        'flex min-h-12 shrink-0 flex-col gap-2 border-b px-4 py-2 lg:flex-row lg:items-center lg:justify-between',
        className,
      )}
      {...props}
    />
  );
}

function PageHeaderCopy({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="page-header-copy"
      className={cn('flex min-w-0 max-w-4xl flex-col gap-0.5', className)}
      {...props}
    />
  );
}

function PageEyebrow({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="page-eyebrow"
      className={cn(
        'font-mono text-[0.6875rem] leading-4 font-medium tracking-[0.08em] text-muted-foreground uppercase',
        className,
      )}
      {...props}
    />
  );
}

function PageTitle({
  className,
  children,
  ...props
}: React.ComponentProps<'h1'>) {
  return (
    <h1
      data-slot="page-title"
      className={cn(
        'font-heading text-lg leading-6 font-semibold tracking-[-0.015em]',
        className,
      )}
      {...props}
    >
      {children}
    </h1>
  );
}

function PageDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="page-description"
      className={cn(
        'max-w-4xl text-xs leading-4 text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

function PageActions({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="page-actions"
      className={cn('flex shrink-0 flex-wrap items-center gap-2', className)}
      {...props}
    />
  );
}

function PageToolbar({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="page-toolbar"
      className={cn(
        'flex min-h-11 shrink-0 flex-col gap-2 border-b px-4 py-1.5 lg:flex-row lg:items-center',
        className,
      )}
      {...props}
    />
  );
}

function Workbench({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="workbench"
      className={cn(
        'grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_24rem]',
        className,
      )}
      {...props}
    />
  );
}

function WorkbenchMain({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="workbench-main"
      className={cn('min-h-0 overflow-y-auto bg-background', className)}
      {...props}
    />
  );
}

function WorkbenchRail({ className, ...props }: React.ComponentProps<'aside'>) {
  return (
    <aside
      data-slot="workbench-rail"
      className={cn(
        'min-h-0 overflow-y-auto border-t bg-card lg:border-t-0 lg:border-l',
        className,
      )}
      {...props}
    />
  );
}

function Inspector({ className, ...props }: React.ComponentProps<'aside'>) {
  return (
    <aside
      data-slot="inspector"
      className={cn(
        'min-h-0 overflow-y-auto border-t bg-card lg:border-t-0 lg:border-l',
        className,
      )}
      {...props}
    />
  );
}

function FactRow({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="fact-row"
      className={cn(
        'flex min-h-9 items-start justify-between gap-4 border-b py-2 text-sm last:border-b-0',
        className,
      )}
      {...props}
    />
  );
}

export {
  EvidenceCanvas,
  EvidencePage,
  FactRow,
  Inspector,
  PageActions,
  PageDescription,
  PageEyebrow,
  PageHeader,
  PageHeaderCopy,
  PageTitle,
  PageToolbar,
  Workbench,
  WorkbenchMain,
  WorkbenchRail,
};
