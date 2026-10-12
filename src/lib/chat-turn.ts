import type { Prisma } from "@prisma/client";
import type { LlmCallRecord } from "./conversation-store";
import { estimateCostUsd, toTokenUsage, type ModelRates } from "./pricing";

type StepLike = {
  stepNumber: number;
  text: string;
  finishReason: string;
  toolCalls: ReadonlyArray<{ toolName: string; input: unknown }>;
  usage: Parameters<typeof toTokenUsage>[0];
  request: { body?: unknown };
  response: { id: string; modelId: string };
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export function toLlmCallRecord(input: {
  step: StepLike;
  model: string;
  instructions: string;
  rates: ModelRates | null;
  latencyMs: number | null;
}): LlmCallRecord {
  const usage = toTokenUsage(input.step.usage);
  return {
    step: input.step.stepNumber,
    purpose: input.step.stepNumber === 0 ? "extract" : "reply",
    model: input.step.response.modelId || input.model,
    request: toJson({ instructions: input.instructions, body: input.step.request.body }),
    response: toJson({
      id: input.step.response.id,
      text: input.step.text,
      toolCalls: input.step.toolCalls.map(({ toolName, input: toolInput }) => ({
        toolName,
        input: toolInput,
      })),
      finishReason: input.step.finishReason,
    }),
    usage,
    costUsd: estimateCostUsd(usage, input.rates),
    latencyMs: input.latencyMs,
  };
}
