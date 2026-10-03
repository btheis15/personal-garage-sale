import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { shopApi } from "@/lib/shop";

/**
 * The Sell app's requests, passed to the Mac mini's /api/admin/… with SHOP_ADMIN_TOKEN, once the
 * Sell app's sign-in is checked here. Photos (multipart) are streamed through as they are.
 */
const ALLOWED = /^(items(\/many|\/[0-9a-f-]{36})?|photos|orders(\/[0-9a-f-]{36})?|charge|settings|status)$/;

async function pass(request: Request, ctx: RouteContext<"/api/sell/[...path]">) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const path = (await ctx.params).path.join("/");
  if (!ALLOWED.test(path)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const type = request.headers.get("content-type") ?? "";
    const opts =
      request.method === "GET" || request.method === "DELETE"
        ? { method: request.method }
        : type.startsWith("multipart/form-data")
          ? { method: request.method, raw: request.body!, contentType: type }
          : { method: request.method, body: await request.json().catch(() => ({})) };
    return NextResponse.json(await shopApi(`/api/admin/${path}`, { ...opts, admin: true }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

export { pass as GET, pass as POST, pass as PATCH, pass as PUT, pass as DELETE };
