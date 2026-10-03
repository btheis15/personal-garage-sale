import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { errorResponse, readJson } from "@/lib/http";
import { deleteItem, getItem, updateItem } from "@/lib/items";
import { isUuid } from "@/lib/orders";

export async function GET(request: Request, ctx: RouteContext<"/api/sell/items/[id]">) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  const item = isUuid(id) ? await getItem(id) : null;
  return item ? NextResponse.json({ item }) : NextResponse.json({ error: "Not found." }, { status: 404 });
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/sell/items/[id]">) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ item: await updateItem(id, await readJson(request)) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/sell/items/[id]">) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    if (isUuid(id)) await deleteItem(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
