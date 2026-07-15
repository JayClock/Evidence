import { assertIterationId } from './artifact-layout';

export interface LegacyTerminalFacts {
  iterationId: string;
  phase: string;
  terminal: 'complete' | 'halted';
  haltedReason?: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

/** Enforce the iteration boundary without projecting a legacy state into an active v5 state. */
export function legacyTerminalFacts(
  raw: Record<string, unknown>,
): LegacyTerminalFacts {
  const iterationId = text(raw.iteration_id) ? raw.iteration_id : 'ITER-0000';
  assertIterationId(iterationId);
  const phase = text(raw.phase) ? raw.phase : 'unknown';
  const halt = record(raw.halted);
  if (phase !== 'complete' && !halt) {
    throw new Error(
      `Legacy iteration ${iterationId} is still active at ${phase}. It is read-only and must be explicitly terminated before a v5 iteration starts.`,
    );
  }
  return {
    iterationId,
    phase,
    terminal: phase === 'complete' ? 'complete' : 'halted',
    ...(halt && text(halt.reason) ? { haltedReason: halt.reason } : {}),
  };
}
