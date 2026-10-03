import { NextResponse } from "next/server";
import { errorResponse, isId } from "@/lib/http";
import { shopApi, shopperIp } from "@/lib/shop";

const ACTIONS: Record<string, string[]> = { renew: [], wallet: ["address"], quote: ["category", "amount"], build: ["address", "category", "amount"], submit: ["hex"] };

/** The payment screen's other requests (a new price; Connect wallet), passed to the Mac mini. */
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/bch/[action]">) {
  const { id, action } = await ctx.params;
  if (!isId(id) || !ACTIONS[action]) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const pass = Object.fromEntries(ACTIONS[action].filter((k) => typeof body[k] === "string").map((k) => [k, body[k]]));
    return NextResponse.json(await shopApi(`/api/orders/${id}/bch/${action}`, { method: "POST", body: pass, shopperIp: shopperIp(request.headers) }));
  } catch (e) {
    return errorResponse(e);
  }
}
