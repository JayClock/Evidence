import { assertIterationId } from '../../iteration/artifact-layout';
import type { LegacyIterationState } from '../../iteration/state';

function record(value: unknown, subject: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${subject} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

/** Project an immutable terminal v4 document without migrating or rewriting it. */
export function readTerminalV4State(
  raw: Record<string, unknown>,
): LegacyIterationState {
  const iterationId = text(raw.iteration_id) ? raw.iteration_id : 'ITER-0000';
  assertIterationId(iterationId);
  const phase = text(raw.phase) ? raw.phase : 'unknown';
  const halt =
    raw.halted && typeof raw.halted === 'object'
      ? record(raw.halted, 'Legacy halt')
      : undefined;
  if (phase !== 'complete' && !halt) {
    throw new Error(
      `Legacy iteration ${iterationId} is still active at ${phase}. It is read-only and must be explicitly terminated before a v5 iteration starts.`,
    );
  }
  return {
    iteration_id: iterationId,
    workflow_version: 4,
    legacy_phase: phase,
    terminal: phase === 'complete' ? 'complete' : 'halted',
    ...(halt && text(halt.reason) ? { halted_reason: halt.reason } : {}),
    ...(raw.requirement_source
      ? {
          requirement_source:
            raw.requirement_source as LegacyIterationState['requirement_source'],
        }
      : {}),
    ...(raw.active_work_item
      ? {
          active_work_item:
            raw.active_work_item as LegacyIterationState['active_work_item'],
        }
      : {}),
    ...(raw.pi && typeof raw.pi === 'object'
      ? { pi: raw.pi as LegacyIterationState['pi'] }
      : {}),
  };
}
