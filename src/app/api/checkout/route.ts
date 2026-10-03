import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { hasShop, shopApi, shopperIp } from "@/lib/shop";

/**
 * The shop's checkout: { lines, customer, fulfillment, method: "stripe" | "bch" | "pickup" }, passed
 * to the Mac mini, which holds the items and starts the payment. Returns { url } to go to next.
 */
export async function POST(request: Request) {
  if (!hasShop) return NextResponse.json({ error: "This is a preview: checkout opens once the shop's server is connected." }, { status: 503 });
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await shopApi("/api/checkout", { method: "POST", body, shopperIp: shopperIp(request.headers) }));
  } catch (e) {
    return errorResponse(e);
  }
}
