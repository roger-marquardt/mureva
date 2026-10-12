import { ConversationStatus, MessageRole, Prisma } from "@prisma/client";
import { prisma } from "./db";
import type { IpLocation } from "./geo";
import type { LeadDraft } from "./lead-schema";
import type { ModelRates, TokenUsage } from "./pricing";

export type LlmCallRecord = {
  step: number;
  purpose: "extract" | "reply";
  model: string;
  request: Prisma.InputJsonValue;
  response: Prisma.InputJsonValue;
  usage: TokenUsage;
  costUsd: number | null;
  latencyMs: number | null;
};

export type ClosingStatus = Exclude<ConversationStatus, "OPEN">;

export async function createConversation(input: {
  model: string;
  ip: string | null;
  userAgent: string | null;
  welcome: string;
}) {
  return prisma.conversation.create({
    data: {
      model: input.model,
      ip: input.ip,
      userAgent: input.userAgent,
      messages: { create: { role: MessageRole.ASSISTANT, content: input.welcome } },
    },
    select: { id: true },
  });
}

export async function saveIpLocation(conversationId: string, location: IpLocation) {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      ipCity: location.city,
      ipRegion: location.region,
      ipCountry: location.country,
      ipNetwork: location.network,
    },
  });
}

export async function findConversationWithMessages(conversationId: string) {
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

export async function appendUserMessage(conversationId: string, content: string) {
  await prisma.message.create({
    data: { conversationId, role: MessageRole.USER, content },
  });
}

export async function countUserMessages(conversationId: string): Promise<number> {
  return prisma.message.count({ where: { conversationId, role: MessageRole.USER } });
}

export async function findModelRates(model: string): Promise<ModelRates | null> {
  const price = await prisma.modelPrice.findUnique({ where: { model } });
  if (!price) {
    return null;
  }
  return {
    inputPerMillionUsd: price.inputPerMillionUsd.toNumber(),
    cachedInputPerMillionUsd: price.cachedInputPerMillionUsd.toNumber(),
    cacheWritePerMillionUsd: price.cacheWritePerMillionUsd.toNumber(),
    outputPerMillionUsd: price.outputPerMillionUsd.toNumber(),
  };
}

export async function recordTurn(input: {
  conversationId: string;
  lead: LeadDraft;
  assistantText: string;
  calls: LlmCallRecord[];
}) {
  const turnUsage = input.calls.reduce(
    (total, call) => ({
      inputTokens: total.inputTokens + call.usage.inputTokens,
      cachedInputTokens: total.cachedInputTokens + call.usage.cachedInputTokens,
      outputTokens: total.outputTokens + call.usage.outputTokens,
    }),
    { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
  );

  await prisma.$transaction([
    prisma.llmCall.createMany({
      data: input.calls.map((call) => ({
        conversationId: input.conversationId,
        step: call.step,
        purpose: call.purpose,
        model: call.model,
        request: call.request,
        response: call.response,
        inputTokens: call.usage.inputTokens,
        cachedInputTokens: call.usage.cachedInputTokens,
        cacheWriteTokens: call.usage.cacheWriteTokens,
        outputTokens: call.usage.outputTokens,
        costUsd: call.costUsd === null ? null : new Prisma.Decimal(call.costUsd),
        latencyMs: call.latencyMs,
      })),
    }),
    ...(input.assistantText
      ? [
          prisma.message.create({
            data: {
              conversationId: input.conversationId,
              role: MessageRole.ASSISTANT,
              content: input.assistantText,
            },
          }),
        ]
      : []),
    prisma.conversation.update({
      where: { id: input.conversationId },
      data: {
        lead: input.lead as Prisma.InputJsonValue,
        inputTokens: { increment: turnUsage.inputTokens },
        cachedInputTokens: { increment: turnUsage.cachedInputTokens },
        outputTokens: { increment: turnUsage.outputTokens },
      },
    }),
  ]);
}

/** Returns true only for the single caller that moves the conversation out of OPEN. */
export async function closeConversation(
  conversationId: string,
  status: ClosingStatus,
): Promise<boolean> {
  const { count } = await prisma.conversation.updateMany({
    where: { id: conversationId, status: ConversationStatus.OPEN },
    data: { status, closedAt: new Date() },
  });
  return count === 1;
}

export async function refreshConversationTotals(conversationId: string) {
  const totals = await prisma.llmCall.aggregate({
    where: { conversationId },
    _sum: { inputTokens: true, cachedInputTokens: true, outputTokens: true, costUsd: true },
  });
  return prisma.conversation.update({
    where: { id: conversationId },
    data: {
      inputTokens: totals._sum.inputTokens ?? 0,
      cachedInputTokens: totals._sum.cachedInputTokens ?? 0,
      outputTokens: totals._sum.outputTokens ?? 0,
      costUsd: totals._sum.costUsd,
    },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

export async function markEmailResult(conversationId: string, error: string | null) {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: error ? { emailError: error } : { emailSentAt: new Date(), emailError: null },
  });
}
