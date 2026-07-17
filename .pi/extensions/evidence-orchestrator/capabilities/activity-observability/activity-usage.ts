export interface ActivityUsage {
  turns: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number | null;
  context_tokens_at_end: number | null;
}

/** Deterministic work has known zero model usage; agent work starts unreported. */
export function zeroActivityUsage(costUsd: number | null = 0): ActivityUsage {
  return {
    turns: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    cost_usd: costUsd,
    context_tokens_at_end: null,
  };
}

/** Combine usage without interpreting an unreported provider cost as zero. */
export function addActivityUsage(
  left: ActivityUsage,
  right: ActivityUsage,
): ActivityUsage {
  return {
    turns: left.turns + right.turns,
    input_tokens: left.input_tokens + right.input_tokens,
    output_tokens: left.output_tokens + right.output_tokens,
    cache_read_tokens: left.cache_read_tokens + right.cache_read_tokens,
    cache_write_tokens: left.cache_write_tokens + right.cache_write_tokens,
    cost_usd:
      left.cost_usd === null || right.cost_usd === null
        ? null
        : left.cost_usd + right.cost_usd,
    context_tokens_at_end:
      right.context_tokens_at_end ?? left.context_tokens_at_end,
  };
}
