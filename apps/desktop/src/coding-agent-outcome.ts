import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';

export interface CodingAgentOutcome {
  assistantResponseSeen: boolean;
  settled: boolean;
  timedOut: boolean;
  stopReason: string | null;
}

export function createCodingAgentOutcome(): CodingAgentOutcome {
  return {
    assistantResponseSeen: false,
    settled: false,
    timedOut: false,
    stopReason: null,
  };
}

export function observeCodingAgentEvent(
  outcome: CodingAgentOutcome,
  event: AgentSessionEvent,
): void {
  if (event.type === 'agent_settled') {
    outcome.settled = true;
    return;
  }
  if (event.type !== 'message_end' || event.message.role !== 'assistant') {
    return;
  }
  outcome.assistantResponseSeen = true;
  outcome.stopReason = event.message.stopReason;
}

export function markCodingAgentTimedOut(outcome: CodingAgentOutcome): void {
  outcome.timedOut = true;
}

export function assertCodingAgentSucceeded(outcome: CodingAgentOutcome): void {
  if (outcome.timedOut) {
    throw new Error('Coding Agent execution timed out.');
  }
  if (!outcome.settled) {
    throw new Error('Coding Agent session did not settle.');
  }
  if (!outcome.assistantResponseSeen) {
    throw new Error('Coding Agent produced no assistant response.');
  }

  switch (outcome.stopReason) {
    case 'stop':
      return;
    case 'error':
      throw new Error('Coding Agent provider request failed.');
    case 'aborted':
      throw new Error('Coding Agent execution was aborted.');
    case 'length':
      throw new Error('Coding Agent response reached its output limit.');
    default:
      throw new Error('Coding Agent did not finish with a final response.');
  }
}
