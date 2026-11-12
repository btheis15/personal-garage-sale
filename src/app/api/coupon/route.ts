import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { hasShop, shopApi, shopperIp } from "@/lib/shop";

/**
 * The checkout's code box: { code, lines } to the Mac mini, which answers { code, label, discountCents }
 * or "That code isn't valid." (404). The amount is always worked out there.
 */
export async function POST(request: Request) {
  if (!hasShop) return NextResponse.json({ error: "This is a preview: coupon codes work once the shop's server is connected." }, { status: 503 });
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(await shopApi("/api/coupon", { method: "POST", body, shopperIp: shopperIp(request.headers) }));
  } catch (e) {
    return errorResponse(e);
  }
}
