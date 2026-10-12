import { Resend } from "resend";
import type { IpLocation } from "./geo";
import { formatIpLocation } from "./geo";
import type { LeadDraft } from "./lead-schema";
import { firstNameOf, formatLeadSummary } from "./lead-schema";

export type TranscriptLine = {
  role: "USER" | "ASSISTANT";
  content: string;
};

export type ConversationEmail = {
  status: "COMPLETED" | "ABANDONED";
  lead: LeadDraft;
  transcript: TranscriptLine[];
  ip: string | null;
  location: IpLocation | null;
};

const STATUS_SUBJECT: Record<ConversationEmail["status"], string> = {
  COMPLETED: "Nova conversa concluída",
  ABANDONED: "Conversa interrompida",
};

export function formatTranscript(transcript: TranscriptLine[], lead: LeadDraft): string {
  const userLabel = firstNameOf(lead) ?? "Cliente";
  return transcript
    .map((line) => `${line.role === "ASSISTANT" ? "Mureva" : userLabel}: ${line.content}`)
    .join("\n\n");
}

function formatOrigin(ip: string | null, location: IpLocation | null): string {
  const place = location ? formatIpLocation(location) : "";
  const network = location?.network ? ` (${location.network})` : "";
  return `IP: ${ip ?? "—"}${place ? ` — ${place}` : ""}${network}`;
}

export function buildConversationEmail(email: ConversationEmail) {
  const subject = `${STATUS_SUBJECT[email.status]} — ${email.lead.name ?? "sem nome"}`;
  const text = [
    formatLeadSummary(email.lead),
    formatOrigin(email.ip, email.location),
    "",
    "———— Conversa completa ————",
    "",
    formatTranscript(email.transcript, email.lead),
  ].join("\n");
  return { subject, text };
}

export async function sendConversationEmail(email: ConversationEmail): Promise<"sent" | "logged"> {
  const to = process.env.EMAIL_TO;
  const apiKey = process.env.RESEND_API_KEY;
  const { subject, text } = buildConversationEmail(email);

  if (!to || !apiKey) {
    console.info(`[conversation-email] RESEND_API_KEY/EMAIL_TO ausentes; e-mail não enviado: ${subject}`);
    return "logged";
  }

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM ?? "Mureva <noreply@resend.dev>";
  const { error } = await resend.emails.send({ from, to, subject, text });
  if (error) {
    throw new Error(error.message);
  }
  return "sent";
}
