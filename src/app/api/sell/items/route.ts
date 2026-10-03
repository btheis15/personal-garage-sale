import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { errorResponse, readJson } from "@/lib/http";
import { createItem, listItems, parseItemInput } from "@/lib/items";

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ items: await listItems() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ item: await createItem(parseItemInput(await readJson(request))) });
  } catch (e) {
    return errorResponse(e);
  }
}
