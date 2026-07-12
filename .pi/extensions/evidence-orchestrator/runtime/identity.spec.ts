import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE } from '../workflow/phase-catalog';
import {
  EXTENSION_ID,
  STATUS_KEY,
  SUBAGENT_MESSAGE_TYPE,
  statusLabel,
} from './identity';

describe('orchestrator identity', () => {
  it('uses one identifier for extension UI and subagent messages', () => {
    expect(EXTENSION_ID).toBe('evidence-orchestrator');
    expect(STATUS_KEY).toBe(EXTENSION_ID);
    expect(SUBAGENT_MESSAGE_TYPE).toBe('evidence-orchestrator-subagent');
    expect(statusLabel(DEFAULT_STATE)).toBe('orchestrator:frame');
    expect(statusLabel(DEFAULT_STATE, 'subagent')).toBe(
      'orchestrator:frame:subagent',
    );
  });
});
