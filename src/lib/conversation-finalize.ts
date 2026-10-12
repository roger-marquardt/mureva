import {
  closeConversation,
  countUserMessages,
  markEmailResult,
  refreshConversationTotals,
  type ClosingStatus,
} from "./conversation-store";
import { sendConversationEmail } from "./email";
import { parseLead } from "./lead-schema";

export type FinalizeResult = "finalized" | "already-closed";

/**
 * Closes an open conversation, recomputes token/cost totals and sends the email.
 * Safe to call concurrently: only the caller that closes the conversation sends the email.
 */
export async function finalizeConversation(
  conversationId: string,
  status: ClosingStatus,
): Promise<FinalizeResult> {
  const closed = await closeConversation(conversationId, status);
  if (!closed) {
    return "already-closed";
  }

  const conversation = await refreshConversationTotals(conversationId);
  const hasLocation = Boolean(conversation.ipCountry || conversation.ipCity);

  try {
    const delivery = await sendConversationEmail({
      status,
      lead: parseLead(conversation.lead),
      transcript: conversation.messages.map(({ role, content }) => ({ role, content })),
      ip: conversation.ip,
      location: hasLocation
        ? {
            city: conversation.ipCity,
            region: conversation.ipRegion,
            country: conversation.ipCountry,
            network: conversation.ipNetwork,
          }
        : null,
    });
    await markEmailResult(
      conversationId,
      delivery === "sent" ? null : "E-mail não configurado (RESEND_API_KEY/EMAIL_TO).",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao enviar e-mail.";
    console.error(`[conversation-finalize] e-mail falhou para ${conversationId}: ${message}`);
    await markEmailResult(conversationId, message);
  }

  return "finalized";
}

/** Abandoned conversations only produce an email if the visitor actually replied. */
export async function abandonConversation(conversationId: string): Promise<FinalizeResult> {
  const userMessages = await countUserMessages(conversationId);
  if (userMessages === 0) {
    const closed = await closeConversation(conversationId, "ABANDONED");
    return closed ? "finalized" : "already-closed";
  }
  return finalizeConversation(conversationId, "ABANDONED");
}
