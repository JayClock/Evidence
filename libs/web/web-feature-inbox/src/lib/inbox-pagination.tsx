import { Button } from '@evidence/ui';

export function InboxPagination({
  label,
  page,
  totalPages,
  hasPrevious,
  hasNext,
  pending = false,
  onPrevious,
  onNext,
}: {
  label: string;
  page: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
  pending?: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav
      aria-label={label}
      className="flex items-center justify-between gap-2 pt-2"
    >
      <p className="font-mono text-[0.6875rem] text-muted-foreground">
        第 {page} 页，共 {totalPages} 页
      </p>
      <div className="flex gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!hasPrevious || pending}
          onClick={onPrevious}
        >
          上一页
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!hasNext || pending}
          onClick={onNext}
        >
          下一页
        </Button>
      </div>
    </nav>
  );
}
