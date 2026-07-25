import { describe, expect, it } from 'vitest';
import { resolveCodingAgentTimeoutMs } from './coding-agent-timeout';

describe('resolveCodingAgentTimeoutMs', () => {
  it('uses a bounded override without allowing an unbounded runtime', () => {
    expect(resolveCodingAgentTimeoutMs()).toBe(30 * 60 * 1_000);
    expect(resolveCodingAgentTimeoutMs('250')).toBe(250);
    expect(() => resolveCodingAgentTimeoutMs('99')).toThrow(
      'must be an integer',
    );
    expect(() => resolveCodingAgentTimeoutMs('not-a-number')).toThrow(
      'must be an integer',
    );
  });
});
