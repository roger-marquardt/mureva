import { estimateCostUsd, toTokenUsage, type ModelRates } from "./pricing";

const GPT_6_LUNA_RATES: ModelRates = {
  inputPerMillionUsd: 0.1,
  cachedInputPerMillionUsd: 0.01,
  cacheWritePerMillionUsd: 0.125,
  outputPerMillionUsd: 0.5,
};

describe("toTokenUsage", () => {
  it("maps SDK usage and defaults missing counts to zero", () => {
    expect(
      toTokenUsage({
        inputTokens: 1200,
        outputTokens: 80,
        inputTokenDetails: { cacheReadTokens: 1000, cacheWriteTokens: undefined },
      }),
    ).toEqual({ inputTokens: 1200, cachedInputTokens: 1000, cacheWriteTokens: 0, outputTokens: 80 });
    expect(toTokenUsage({ inputTokens: undefined, outputTokens: undefined })).toEqual({
      inputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 0,
    });
  });
});

describe("estimateCostUsd", () => {
  it("bills uncached, cached, cache-write and output tokens at their own rates", () => {
    const cost = estimateCostUsd(
      { inputTokens: 1_000_000, cachedInputTokens: 400_000, cacheWriteTokens: 100_000, outputTokens: 200_000 },
      GPT_6_LUNA_RATES,
    );
    expect(cost).toBeCloseTo(0.05 + 0.004 + 0.0125 + 0.1, 10);
  });

  it("returns null when the model has no price", () => {
    expect(
      estimateCostUsd({ inputTokens: 10, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 5 }, null),
    ).toBeNull();
  });
});
