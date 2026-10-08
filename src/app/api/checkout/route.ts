import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { PARTNER_COOKIE, partnerCodeOk } from "@/lib/partner-ref";
import { hasShop, shopApi, shopperIp } from "@/lib/shop";

/**
 * The shop's checkout: { lines, customer, fulfillment, method: "stripe" | "bch" | "pickup" }, passed
 * to the Mac mini, which holds the items and starts the payment. Returns { url } to go to next.
 * A friend's "Spread the word" link (remembered in a cookie) goes along: it only counts for Bitcoin Cash.
 */
export async function POST(request: Request) {
  if (!hasShop) return NextResponse.json({ error: "This is a preview: checkout opens once the shop's server is connected." }, { status: 503 });
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const ref = (await cookies()).get(PARTNER_COOKIE)?.value;
    if (body && typeof body === "object") body.partner = partnerCodeOk(ref) ? ref : undefined;
    return NextResponse.json(await shopApi("/api/checkout", { method: "POST", body, shopperIp: shopperIp(request.headers) }));
  } catch (e) {
    return errorResponse(e);
  }
}
