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
      className="mt-4 flex items-center justify-between gap-3"
    >
      <p className="text-sm text-muted-foreground">
        第 {page} 页，共 {totalPages} 页
      </p>
      <div className="flex gap-2">
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
