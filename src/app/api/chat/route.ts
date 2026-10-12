import { toLlmCallRecord } from "@/lib/chat-turn";
import { finalizeConversation } from "@/lib/conversation-finalize";
import {
  appendUserMessage,
  findConversationWithMessages,
  findModelRates,
  recordTurn,
} from "@/lib/conversation-store";
import {
  acceptedExtraction,
  chipsForField,
  firstNameOf,
  isLeadComplete,
  leadExtractionSchema,
  leadPatchFromExtraction,
  mergeLead,
  nextMissingField,
  parseLead,
  type LeadDraft,
} from "@/lib/lead-schema";
import { extractionInstructions, replyInstructions } from "@/lib/prompts/buyer-chat";
import { openai } from "@ai-sdk/openai";
import { isStepCount, streamText, tool, type ModelMessage } from "ai";
import { z } from "zod";

export const runtime = "nodejs";

const MESSAGE_MAX_LENGTH = 2000;

const requestSchema = z.object({
  conversationId: z.string().min(1),
  message: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
});

function encodeEvent(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function toModelMessages(
  messages: ReadonlyArray<{ role: "USER" | "ASSISTANT"; content: string }>,
): ModelMessage[] {
  return messages.map((message) =>
    message.role === "USER"
      ? { role: "user", content: message.content }
      : { role: "assistant", content: message.content },
  );
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "OPENAI_API_KEY não configurada." }, { status: 500 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Pedido inválido." }, { status: 400 });
  }
  const { conversationId, message } = parsed.data;

  const conversation = await findConversationWithMessages(conversationId);
  if (!conversation) {
    return Response.json({ error: "Conversa não encontrada." }, { status: 404 });
  }
  if (conversation.status !== "OPEN") {
    return Response.json({ error: "Esta conversa já foi encerrada." }, { status: 409 });
  }

  await appendUserMessage(conversationId, message);

  const model = conversation.model;
  const rates = await findModelRates(model);
  let lead: LeadDraft = parseLead(conversation.lead);
  const askedField = nextMissingField(lead);
  const instructionsByStep = new Map<number, string>();
  const startedAtByStep = new Map<number, number>();
  const latencyByStep = new Map<number, number>();

  const result = streamText({
    model: openai(model),
    messages: toModelMessages([...conversation.messages, { role: "USER", content: message }]),
    tools: {
      update_lead: tool({
        description: "Registra os dados do imóvel e do contato informados na última mensagem.",
        inputSchema: leadExtractionSchema,
        strict: true,
        execute: async (extraction) => {
          lead = mergeLead(lead, acceptedExtraction(leadPatchFromExtraction(extraction), askedField));
          return { saved: true };
        },
      }),
    },
    prepareStep: ({ stepNumber }) => {
      const isExtraction = stepNumber === 0;
      const instructions = isExtraction ? extractionInstructions(lead) : replyInstructions(lead);
      instructionsByStep.set(stepNumber, instructions);
      startedAtByStep.set(stepNumber, Date.now());
      return isExtraction
        ? { instructions, toolChoice: { type: "tool", toolName: "update_lead" } }
        : { instructions, toolChoice: "none", activeTools: [] };
    },
    onStepFinish: (step) => {
      const startedAt = startedAtByStep.get(step.stepNumber);
      if (startedAt !== undefined) {
        latencyByStep.set(step.stepNumber, Date.now() - startedAt);
      }
    },
    stopWhen: isStepCount(2),
    include: { requestBody: true },
  });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let assistantText = "";
        for await (const part of result.fullStream) {
          if (part.type === "text-delta" && part.text) {
            assistantText += part.text;
            controller.enqueue(encodeEvent({ type: "text", delta: part.text }));
          }
        }

        const steps = await result.steps;
        const completed = isLeadComplete(lead);
        await recordTurn({
          conversationId,
          lead,
          assistantText,
          calls: steps.map((step) =>
            toLlmCallRecord({
              step,
              model,
              instructions: instructionsByStep.get(step.stepNumber) ?? "",
              rates,
              latencyMs: latencyByStep.get(step.stepNumber) ?? null,
            }),
          ),
        });

        controller.enqueue(
          encodeEvent({
            type: "state",
            firstName: firstNameOf(lead) ?? null,
            chips: completed ? [] : chipsForField(nextMissingField(lead)),
            closed: completed,
          }),
        );

        if (completed) {
          await finalizeConversation(conversationId, "COMPLETED");
        }
        controller.enqueue(encodeEvent({ type: "done" }));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error(`[chat] falha na conversa ${conversationId}: ${detail}`);
        controller.enqueue(
          encodeEvent({ type: "error", message: "Tive um problema para responder. Pode tentar de novo?" }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
