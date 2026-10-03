import "server-only";
import { NextResponse } from "next/server";
import { ShopApiError } from "./shop";

/** The Mac mini's answer as this site's answer: its message and status, or a general one. */
export function errorResponse(e: unknown) {
  if (e instanceof ShopApiError) return NextResponse.json({ error: e.message, ...(e.itemIds ? { itemIds: e.itemIds } : {}) }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export const isId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
