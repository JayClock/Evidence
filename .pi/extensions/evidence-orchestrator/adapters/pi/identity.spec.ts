import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../../iteration/default-state';
import { EXTENSION_ID, STATUS_KEY, statusLabel } from './identity';

describe('orchestrator identity', () => {
  it('uses one identifier for extension UI state', () => {
    expect(EXTENSION_ID).toBe('evidence-orchestrator');
    expect(STATUS_KEY).toBe(EXTENSION_ID);
    expect(statusLabel(undefined)).toBe('orchestrator:idle');
    expect(statusLabel(DEFAULT_STATE)).toBe('orchestrator:kickoff');
    expect(statusLabel(DEFAULT_STATE, 'agent')).toBe(
      'orchestrator:kickoff:agent',
    );
  });
});
