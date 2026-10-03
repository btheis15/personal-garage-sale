import "server-only";
import { NextResponse } from "next/server";

/** A JSON error for any thrown error: its own message and status when it has one (InputError, Unavailable…). */
export function errorResponse(e: unknown, fallback = "Something went wrong. Please try again.") {
  const err = e as { message?: string; status?: number; itemIds?: string[] };
  const status = typeof err?.status === "number" && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error(e);
  return NextResponse.json(
    { error: status >= 500 && status !== 503 ? fallback : (err?.message ?? fallback), ...(err?.itemIds ? { itemIds: err.itemIds } : {}) },
    { status },
  );
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** A buyer's contact details from a form. */
export function readCustomer(v: unknown) {
  const c = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const email = str(c.email, 120);
  return {
    name: str(c.name, 80) || undefined,
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined,
    phone: str(c.phone, 40) || undefined,
    note: str(c.note, 1000) || undefined,
  };
}

export function readLines(v: unknown) {
  return (Array.isArray(v) ? v : [])
    .slice(0, 50)
    .map((l) => ({ id: str((l as { id?: unknown })?.id, 40), qty: Number((l as { qty?: unknown })?.qty) || 1 }));
}
