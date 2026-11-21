import { useCallback, useEffect, useState } from 'react';

export type WorkspaceViewMode = 'journey' | 'table' | 'story';

export const useWorkspaceViewMode = () => {
  const [mode, setMode] = useState<WorkspaceViewMode>('journey');

  const toggleLedger = useCallback(() => {
    setMode((current) => (current === 'table' ? 'journey' : 'table'));
  }, []);

  const returnToGraph = useCallback(() => setMode('journey'), []);

  useEffect(() => {
    if (mode !== 'table') return;
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
  }, [mode, returnToGraph]);

  return { mode, setMode, toggleLedger, returnToGraph } as const;
};
