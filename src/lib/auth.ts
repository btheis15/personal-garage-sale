import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * The Sell app's sign-in: one password (ADMIN_PASSWORD), and a signed cookie that lasts 60 days
 * so your phone stays signed in. Changing ADMIN_PASSWORD (or SESSION_SECRET) signs every device out.
 */
export const SESSION_COOKIE = "gs_session";
const DAYS = 60;

const password = () => process.env.ADMIN_PASSWORD ?? "";
export const hasPassword = () => password().length >= 8;

function signingKey() {
  return createHash("sha256")
    .update(`${process.env.SESSION_SECRET ?? ""}\0${password()}\0${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`)
    .digest();
}

const sign = (payload: string) => createHmac("sha256", signingKey()).update(payload).digest("base64url");

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPassword(attempt: string) {
  if (!hasPassword()) return false;
  // Compared as hashes, so the length of the password isn't given away by timing.
  const h = (s: string) => createHash("sha256").update(s).digest("base64");
  return safeEqual(h(attempt), h(password()));
}

export function newSession() {
  const expires = Date.now() + DAYS * 86_400_000;
  const payload = `v1.${expires}`;
  return { value: `${payload}.${sign(payload)}`, expires: new Date(expires) };
}

export function validSession(value: string | undefined) {
  if (!value || !hasPassword()) return false;
  const i = value.lastIndexOf(".");
  if (i < 0) return false;
  const payload = value.slice(0, i);
  const [v, exp] = payload.split(".");
  return v === "v1" && Number(exp) > Date.now() && safeEqual(value.slice(i + 1), sign(payload));
}

export async function isSignedIn() {
  return validSession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** For the Sell app's API routes: a 401 response when not signed in, else null. */
export async function requireAdmin(request?: Request): Promise<NextResponse | null> {
  // Only from the Sell app's own pages: a form on another site can't post here with the cookie.
  if (request && request.method !== "GET" && request.headers.get("x-sell-app") !== "1")
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (await isSignedIn()) return null;
  return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
}
