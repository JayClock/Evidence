import { Button } from '@evidence/ui';

export function DeliveryPagination({
  label,
  page,
  totalPages,
  hasPrevious,
  hasNext,
  pending,
  onPrevious,
  onNext,
}: {
  label: string;
  page: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
  pending: boolean;
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
      <Button
        disabled={pending || !hasPrevious}
        size="sm"
        type="button"
        variant="outline"
        onClick={onPrevious}
      >
        Previous
      </Button>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Page {page} of {totalPages}
      </p>
      <Button
        disabled={pending || !hasNext}
        size="sm"
        type="button"
        variant="outline"
        onClick={onNext}
      >
        Next
      </Button>
    </nav>
  );
}
