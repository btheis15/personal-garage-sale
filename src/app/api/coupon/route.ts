import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { hasShop, shopApi, shopperIp } from "@/lib/shop";

/** Checks a typed coupon code against the cart: { code, lines } to the Mac mini. Returns { code, label, discountCents }. */
export async function POST(request: Request) {
  if (!hasShop) return NextResponse.json({ error: "This is a preview: checkout opens once the shop's server is connected." }, { status: 503 });
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(await shopApi("/api/coupon", { method: "POST", body, shopperIp: shopperIp(request.headers) }));
  } catch (e) {
    return errorResponse(e);
  }
}
