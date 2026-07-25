import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';
import {
  assertCodingAgentSucceeded,
  createCodingAgentOutcome,
  markCodingAgentTimedOut,
  observeCodingAgentEvent,
} from './coding-agent-outcome';

describe('Coding Agent outcome', () => {
  it('accepts only a settled final assistant stop', () => {
    const outcome = createCodingAgentOutcome();
    observeCodingAgentEvent(outcome, assistantMessage('stop'));
    observeCodingAgentEvent(outcome, settled());

    expect(() => assertCodingAgentSucceeded(outcome)).not.toThrow();
  });

  it('uses the successful response after a provider retry', () => {
    const outcome = createCodingAgentOutcome();
    observeCodingAgentEvent(outcome, assistantMessage('error'));
    observeCodingAgentEvent(outcome, assistantMessage('stop'));
    observeCodingAgentEvent(outcome, settled());

    expect(() => assertCodingAgentSucceeded(outcome)).not.toThrow();
  });

  it.each([
    ['error', 'provider request failed'],
    ['aborted', 'execution was aborted'],
    ['length', 'reached its output limit'],
    ['toolUse', 'did not finish with a final response'],
  ])('rejects a final %s response', (stopReason, expected) => {
    const outcome = createCodingAgentOutcome();
    observeCodingAgentEvent(outcome, assistantMessage(stopReason));
    observeCodingAgentEvent(outcome, settled());

    expect(() => assertCodingAgentSucceeded(outcome)).toThrow(expected);
  });

  it('rejects a timed out session even when abort settles it', () => {
    const outcome = createCodingAgentOutcome();
    markCodingAgentTimedOut(outcome);
    observeCodingAgentEvent(outcome, assistantMessage('aborted'));
    observeCodingAgentEvent(outcome, settled());

    expect(() => assertCodingAgentSucceeded(outcome)).toThrow('timed out');
  });
});

function assistantMessage(stopReason: string): AgentSessionEvent {
  return {
    type: 'message_end',
    message: { role: 'assistant', stopReason },
  } as unknown as AgentSessionEvent;
}

function settled(): AgentSessionEvent {
  return { type: 'agent_settled' };
}
