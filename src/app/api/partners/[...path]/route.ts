import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { hasShop, shopApi, shopperIp } from "@/lib/shop";

/** "Spread the word": signing up, and a friend's own page (their key travels in the body, never a URL). */
const FIELDS: Record<string, string[]> = {
  signup: ["name", "address", "email", "country", "mailingAddress", "usPerson", "certify", "agree"],
  me: ["key"],
  "me/address": ["key", "address"],
  "me/email": ["key", "email"],
};

export async function POST(request: Request, ctx: RouteContext<"/api/partners/[...path]">) {
  const path = (await ctx.params).path.join("/");
  if (!FIELDS[path]) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!hasShop) return NextResponse.json({ error: "This is a preview: Spread the word opens once the shop's server is connected." }, { status: 503 });
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const pass = Object.fromEntries(FIELDS[path].filter((k) => k in body).map((k) => [k, body[k]]));
    return NextResponse.json(await shopApi(`/api/partners/${path}`, { method: "POST", body: pass, shopperIp: shopperIp(request.headers) }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
