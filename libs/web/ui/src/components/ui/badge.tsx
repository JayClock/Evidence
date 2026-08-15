import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';

import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/85',
        secondary: 'bg-secondary text-secondary-foreground [a]:hover:bg-accent',
        destructive:
          'border-status-invalid/20 bg-status-invalid-soft text-status-invalid focus-visible:ring-status-invalid/20 [a]:hover:bg-status-invalid-soft/70',
        outline: 'border-border bg-card text-foreground [a]:hover:bg-muted',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        link: 'text-status-info underline-offset-4 hover:underline',
        info: 'border-status-info/20 bg-status-info-soft text-status-info',
        proposal:
          'border-status-proposal/20 bg-status-proposal-soft text-status-proposal',
        verified:
          'border-status-verified/20 bg-status-verified-soft text-status-verified',
        decision:
          'border-status-decision/20 bg-status-decision-soft text-status-decision',
        invalidated:
          'border-status-invalid/20 bg-status-invalid-soft text-status-invalid',
        locked:
          'border-status-locked/20 bg-status-locked-soft text-status-locked',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
