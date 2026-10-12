import { abandonConversation } from "@/lib/conversation-finalize";

export const runtime = "nodejs";

export async function POST(_request: Request, ctx: RouteContext<"/api/conversations/[id]/abandon">) {
  const { id } = await ctx.params;
  try {
    await abandonConversation(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[abandon] falha ao encerrar ${id}: ${message}`);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
