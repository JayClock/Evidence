import type { LegacyIterationState } from '../../iteration/state';
import { legacyTerminalFacts } from '../../iteration/terminal-policy';

/** Project an immutable terminal v4 document without migrating or rewriting it. */
export function readTerminalV4State(
  raw: Record<string, unknown>,
): LegacyIterationState {
  const facts = legacyTerminalFacts(raw);
  return {
    iteration_id: facts.iterationId,
    workflow_version: 4,
    legacy_phase: facts.phase,
    terminal: facts.terminal,
    ...(facts.haltedReason ? { halted_reason: facts.haltedReason } : {}),
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
