import { NextResponse } from "next/server";
import { checkPassword, hasPassword, newSession, SESSION_COOKIE } from "@/lib/auth";

// A few wrong guesses per minute per address, per server instance: slows anyone guessing.
const attempts = new Map<string, number[]>();

export async function POST(request: Request) {
  if (!hasPassword()) return NextResponse.json({ error: "Set ADMIN_PASSWORD (8+ characters) in Vercel first (see README)." }, { status: 503 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 5) return NextResponse.json({ error: "Too many tries. Wait a minute and try again." }, { status: 429 });
  const { password } = (await request.json().catch(() => ({}))) as { password?: unknown };
  if (typeof password !== "string" || !checkPassword(password)) {
    attempts.set(ip, [...recent, now]);
    return NextResponse.json({ error: "That password isn't right." }, { status: 401 });
  }
  attempts.delete(ip);
  const s = newSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, s.value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: s.expires });
  return res;
}
