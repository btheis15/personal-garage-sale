import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isShopReachable, refreshShop } from "@/lib/shop";

/**
 * The Mac mini calls this after every change (Authorization: Bearer REVALIDATE_SECRET), so new
 * items show up within seconds.
 */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET ?? "";
  const auth = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (!secret || auth.length !== want.length || !timingSafeEqual(auth, want)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Only drop the cached pages once the fresh catalog can be read; otherwise every page would error.
  if (!(await isShopReachable())) return NextResponse.json({ error: "Catalog unreachable; keeping cached pages" }, { status: 503 });
  refreshShop();
  return NextResponse.json({ revalidated: true });
}
