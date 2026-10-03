import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { bchTick } from "@/lib/bch";
import { db, hasDatabase } from "@/lib/db";
import { refreshShop } from "@/lib/items";

/**
 * Housekeeping, run by Vercel Cron (vercel.json): gives back items whose checkout hold ran out,
 * and looks once more at Bitcoin Cash payments nobody was watching. Checkouts already do the first
 * as they happen, so once a day is plenty (the most Vercel's free plan allows).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const auth = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (!secret || auth.length !== want.length || !timingSafeEqual(auth, want)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasDatabase) return NextResponse.json({ ok: true, skipped: "no database" });
  const { data: expired } = await db().rpc("expire_stale_orders");
  if (expired) refreshShop();
  await bchTick().catch((e) => console.error("[cron] bch", e));
  return NextResponse.json({ ok: true, expired: expired ?? 0 });
}
