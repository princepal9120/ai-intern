/**
 * Pure cost-estimation helpers. Dependency-free so they run in the Worker,
 * in Vitest, and anywhere else without modification.
 */

/** Sandbox container rate: ~$2.50 per hour, expressed per second. */
export const SANDBOX_RATE_PER_SECOND = 2.5 / 3600;

/** AI Gateway / provider inference rate per token. */
export const AI_GATEWAY_RATE_PER_TOKEN = 0.00001;

export interface RunCostInput {
  durationMs: number;
  tokens: number;
}

export interface RunCost {
  sandboxCost: number;
  tokenCost: number;
  total: number;
}

/**
 * Estimate the cost of one coding run from wall-clock duration and
 * billed model tokens. Pure and deterministic.
 */
export function estimateRunCost(input: RunCostInput): RunCost {
  const sandboxCost = (input.durationMs / 1000) * SANDBOX_RATE_PER_SECOND;
  const tokenCost = input.tokens * AI_GATEWAY_RATE_PER_TOKEN;
  return { sandboxCost, tokenCost, total: sandboxCost + tokenCost };
}
