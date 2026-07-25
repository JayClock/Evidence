const DEFAULT_TIMEOUT_MS = 30 * 60 * 1_000;
const MINIMUM_TIMEOUT_MS = 100;
const MAXIMUM_TIMEOUT_MS = 60 * 60 * 1_000;

export function resolveCodingAgentTimeoutMs(
  value = process.env.EVIDENCE_CODING_AGENT_TIMEOUT_MS,
): number {
  const normalized = value?.trim();
  if (!normalized) return DEFAULT_TIMEOUT_MS;
  const timeout = Number(normalized);
  if (
    !Number.isSafeInteger(timeout) ||
    timeout < MINIMUM_TIMEOUT_MS ||
    timeout > MAXIMUM_TIMEOUT_MS
  ) {
    throw new Error(
      `EVIDENCE_CODING_AGENT_TIMEOUT_MS must be an integer from ${String(MINIMUM_TIMEOUT_MS)} through ${String(MAXIMUM_TIMEOUT_MS)}.`,
    );
  }
  return timeout;
}
