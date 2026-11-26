import { useId, useRef, type ReactNode } from 'react';
import {
  Button,
  Popover,
  PopoverAnchor,
  PopoverClose,
  PopoverContent,
} from '@evidence-poc/desktop-ui-kit';

export interface CanvasEvidenceClarification {
  nodeId: string | null;
  busy: boolean;
  onOpen: (nodeId: string) => void;
  onClose: (nodeId: string) => void;
  onAcceptPatch?: () => void;
  onRevertPatch?: () => void;
  content: ReactNode;
}

export const EvidenceInquiryPopover = ({
  nodeId,
  label,
  width,
  height,
  inquiry,
  children,
}: {
  nodeId: string;
  label: string;
  width: number;
  height: number;
  inquiry: CanvasEvidenceClarification;
  children: ReactNode;
}) => {
  const panelId = useId();
  const titleId = useId();
  const trigger = useRef<HTMLButtonElement | null>(null);
  const active = inquiry.nodeId === nodeId;
  return (
    <Popover
      open={active}
      onOpenChange={(open) => !open && inquiry.onClose(nodeId)}
    >
      <PopoverAnchor asChild>
        <div className="relative" style={{ width, height }}>
          {children}
          <Button
            ref={trigger}
            type="button"
            size="xs"
            variant="outline"
            aria-label={`澄清权责：${label}`}
            aria-haspopup="dialog"
            aria-expanded={active}
            aria-controls={active ? panelId : undefined}
            disabled={inquiry.busy && !active}
            data-canvas-control=""
            data-evidence-capture-hide=""
            className="nodrag nopan absolute right-2 bottom-1"
            onClick={(event) => {
              event.stopPropagation();
              if (active) inquiry.onClose(nodeId);
              else inquiry.onOpen(nodeId);
            }}
          >
            澄清权责
          </Button>
        </div>
      </PopoverAnchor>
      {active ? (
        <PopoverContent
          id={panelId}
          aria-labelledby={titleId}
          side="right"
          sideOffset={12}
          collisionPadding={12}
          updatePositionStrategy="always"
          data-workbench-chrome=""
          data-evidence-inquiry=""
          data-evidence-capture-hide=""
          className="nodrag nopan nowheel flex h-[min(28rem,var(--radix-popover-content-available-height))] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden p-0"
          onOpenAutoFocus={(event) => {
            const field = document
              .getElementById(panelId)
              ?.querySelector<HTMLTextAreaElement>('textarea:not(:disabled)');
            if (field !== undefined && field !== null) {
              event.preventDefault();
              field.focus({ preventScroll: true });
            }
          }}
          onEscapeKeyDown={(event) => {
            if (event.isComposing || event.keyCode === 229) {
              event.preventDefault();
              return;
            }
            if (!inquiry.onRevertPatch) return;
            event.preventDefault();
            if (!event.repeat) inquiry.onRevertPatch();
          }}
          onKeyDown={(event) => {
            if (
              event.key !== 'Enter' ||
              event.shiftKey ||
              event.altKey ||
              event.nativeEvent.isComposing ||
              event.keyCode === 229 ||
              !inquiry.onAcceptPatch
            )
              return;
            // Keep normal Enter behavior on buttons (close, revert, locate).
            if (
              !(
                event.metaKey ||
                event.ctrlKey ||
                event.target instanceof HTMLTextAreaElement
              )
            )
              return;
            event.preventDefault();
            if (!event.repeat) inquiry.onAcceptPatch();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (document.activeElement === document.body)
              trigger.current?.focus();
          }}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-workbench-border px-3 py-1.5">
            <span id={titleId} className="truncate text-xs font-semibold">
              权责与交付澄清：{label}
            </span>
            <PopoverClose asChild>
              <Button type="button" variant="ghost" size="xs">
                关闭
              </Button>
            </PopoverClose>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{inquiry.content}</div>
        </PopoverContent>
      ) : null}
    </Popover>
  );
};
