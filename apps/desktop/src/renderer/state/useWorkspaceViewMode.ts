import { useCallback, useEffect, useState } from 'react';

export type WorkspaceSurface = 'canvas' | 'table';

export const useWorkspaceViewMode = () => {
  const [surface, setSurface] = useState<WorkspaceSurface>('canvas');

  const toggleLedger = useCallback(() => {
    setSurface((current) => (current === 'table' ? 'canvas' : 'table'));
  }, []);

  const returnToGraph = useCallback(() => setSurface('canvas'), []);

  useEffect(() => {
    if (surface !== 'table') return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.defaultPrevented ||
        event.isComposing ||
        !event.altKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.code !== 'Digit1' ||
        (target instanceof Element &&
          target.closest(
            'input, textarea, select, [contenteditable], [role="dialog"]',
          ))
      )
        return;
      event.preventDefault();
      returnToGraph();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [surface, returnToGraph]);

  return { surface, toggleLedger, returnToGraph } as const;
};
