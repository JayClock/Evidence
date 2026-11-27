// Upstream registry source: https://ui.shadcn.com/r/styles/new-york/skeleton.json
import { cn } from '../../utils.js';

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-primary/10', className)}
      {...props}
    />
  );
}

export { Skeleton };
