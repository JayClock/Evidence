import { act, fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useWorkspaceViewMode } from './useWorkspaceViewMode';

describe('useWorkspaceViewMode', () => {
  it('defaults to the journey and does not bind Alt+2', () => {
    const { result } = renderHook(useWorkspaceViewMode);
    expect(result.current.mode).toBe('journey');
    expect(fireEvent.keyDown(window, { code: 'Digit2', altKey: true })).toBe(
      true,
    );
    expect(result.current.mode).toBe('journey');
  });

  it('toggles the ledger and returns to the canvas with Alt+1', () => {
    const { result } = renderHook(useWorkspaceViewMode);
    act(() => result.current.toggleLedger());
    expect(result.current.mode).toBe('table');
    act(() => result.current.toggleLedger());
    expect(result.current.mode).toBe('journey');
    act(() => result.current.toggleLedger());
    fireEvent.keyDown(window, { code: 'Digit1', altKey: true });
    expect(result.current.mode).toBe('journey');
  });
});
