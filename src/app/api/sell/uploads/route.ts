import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db, PHOTO_BUCKET, photoUrl } from "@/lib/db";
import { errorResponse, readJson } from "@/lib/http";

/**
 * A one-time address the Sell app uploads a photo to, straight to Supabase Storage (so big photos
 * don't go through Vercel, which caps request bodies at 4.5 MB). The app shrinks photos first.
 * { count } → { uploads: [{ path, token, url }] }.
 */
export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const { count } = await readJson(request);
    const n = Math.max(1, Math.min(12, Number(count) || 1));
    const month = new Date().toISOString().slice(0, 7).replace("-", "/");
    const uploads = [];
    for (let i = 0; i < n; i++) {
      const path = `${month}/${randomUUID()}.jpg`;
      const { data, error } = await db().storage.from(PHOTO_BUCKET).createSignedUploadUrl(path);
      if (error) throw new Error(error.message);
      uploads.push({ path, token: data.token, signedUrl: data.signedUrl, url: photoUrl(path) });
    }
    return NextResponse.json({ uploads });
  } catch (e) {
    return errorResponse(e);
  }
}
