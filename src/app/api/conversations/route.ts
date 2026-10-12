import { createConversation, saveIpLocation } from "@/lib/conversation-store";
import { clientIpFrom, lookupIpLocation } from "@/lib/geo";
import { chatModelId } from "@/lib/model";
import { WELCOME_MESSAGE } from "@/lib/welcome-message";
import { after } from "next/server";

export const runtime = "nodejs";

const USER_AGENT_MAX_LENGTH = 512;

export async function POST(request: Request) {
  const ip = clientIpFrom(request.headers);
  const userAgent = request.headers.get("user-agent")?.slice(0, USER_AGENT_MAX_LENGTH) ?? null;

  const conversation = await createConversation({
    model: chatModelId(),
    ip,
    userAgent,
    welcome: WELCOME_MESSAGE,
  });

  if (ip) {
    after(async () => {
      try {
        const location = await lookupIpLocation(ip);
        if (location) {
          await saveIpLocation(conversation.id, location);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[geo] localização indisponível para ${conversation.id}: ${message}`);
      }
    });
  }

  return Response.json({ id: conversation.id }, { status: 201 });
}
