export type ModelRates = {
  inputPerMillionUsd: number;
  cachedInputPerMillionUsd: number;
  cacheWritePerMillionUsd: number;
  outputPerMillionUsd: number;
};

export type TokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
};

type SdkUsage = {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  inputTokenDetails?: {
    cacheReadTokens: number | undefined;
    cacheWriteTokens: number | undefined;
  };
};

const TOKENS_PER_MILLION = 1_000_000;

export function toTokenUsage(usage: SdkUsage): TokenUsage {
  return {
    inputTokens: usage.inputTokens ?? 0,
    cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
    cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
  };
}

/** Input tokens include cached reads and cache writes; each slice is billed at its own rate. */
export function estimateCostUsd(usage: TokenUsage, rates: ModelRates | null): number | null {
  if (!rates) {
    return null;
  }
  const uncachedInput = Math.max(
    usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens,
    0,
  );
  const total =
    uncachedInput * rates.inputPerMillionUsd +
    usage.cachedInputTokens * rates.cachedInputPerMillionUsd +
    usage.cacheWriteTokens * rates.cacheWritePerMillionUsd +
    usage.outputTokens * rates.outputPerMillionUsd;
  return total / TOKENS_PER_MILLION;
}
