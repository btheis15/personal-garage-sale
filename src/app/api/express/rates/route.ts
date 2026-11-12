import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { hasShop, shopApi, shopperIp } from "@/lib/shop";

/** Apple Pay / Google Pay sheet: the wallet's partial address and the cart go to the Mac mini, which answers with shipping options and the exact money. */
export async function POST(request: Request) {
  if (!hasShop) return NextResponse.json({ error: "This is a preview: Apple Pay and Google Pay work once the shop's server is connected." }, { status: 503 });
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(await shopApi("/api/express/rates", { method: "POST", body, shopperIp: shopperIp(request.headers) }));
  } catch (e) {
    return errorResponse(e);
  }
}
