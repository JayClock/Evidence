import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupWorkspaces,
  TEST_FLOW_POLICY,
  workspace,
  write,
} from '../../test-support/support';
import { normalizeFlowPolicy, readFlowPolicy } from './policy';

afterEach(cleanupWorkspaces);

describe('Flow policy', () => {
  it('loads the human-managed policy with a content hash', () => {
    const cwd = workspace();

    expect(readFlowPolicy(cwd)).toMatchObject({
      path: 'engineering/evidence-orchestrator/flow-policy.json',
      sha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      policy: TEST_FLOW_POLICY,
    });
  });

  it('rejects missing, unknown, and non-positive limits', () => {
    expect(() =>
      normalizeFlowPolicy({
        ...TEST_FLOW_POLICY,
        max_active_stories: 0,
      }),
    ).toThrow('must be a positive integer');
    expect(() =>
      normalizeFlowPolicy({ ...TEST_FLOW_POLICY, automatic_pull: true }),
    ).toThrow('unsupported automatic_pull');

    const cwd = workspace();
    write(
      cwd,
      'engineering/evidence-orchestrator/flow-policy.json',
      '{invalid',
    );
    expect(() => readFlowPolicy(cwd)).toThrow('invalid JSON');
  });
});
