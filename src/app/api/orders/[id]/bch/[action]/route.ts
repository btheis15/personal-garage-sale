import { NextResponse } from "next/server";
import { bch, hasBch } from "@/lib/bch";
import { errorResponse, readJson } from "@/lib/http";
import { getOrder } from "@/lib/orders";

const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 20_000) : "");

/**
 * The payment screen's other requests: renew (a new price once one ran out), and Connect wallet
 * (wallet: what it holds, quote, build: the transaction to sign, submit: the signed one).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/bch/[action]">) {
  try {
    const { id, action } = await ctx.params;
    if (!hasBch()) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    const order = await getOrder(id);
    if (!order || order.method !== "bch") return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    const body = await readJson(request);
    const engine = bch();
    switch (action) {
      case "renew":
        // A new price only while the items are still held for this order.
        if (order.status !== "pending") return NextResponse.json({ error: "This checkout has closed. Please start again from the shop." }, { status: 409 });
        return NextResponse.json(await engine.renew(id));
      case "wallet":
        return NextResponse.json(await engine.walletInfo(id, str(body.address)));
      case "quote":
        return NextResponse.json(await engine.walletQuote(id, { category: str(body.category), amount: str(body.amount) }));
      case "build":
        return NextResponse.json(await engine.walletBuild(id, { address: str(body.address), category: str(body.category), amount: str(body.amount) }));
      case "submit":
        return NextResponse.json(await engine.walletSubmit(id, str(body.hex)));
      default:
        return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
  } catch (e) {
    return errorResponse(e);
  }
}
