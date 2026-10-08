/** What the "Spread the word" pages share: calling /api/partners, money, and the page key on this device. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; errors?: Record<string, string>; status: number };

export async function post<T>(path: string, body: Record<string, unknown>): Promise<ApiResult<T>> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = (await res?.json().catch(() => null)) as (T & { error?: string; errors?: Record<string, string> }) | null;
  if (res?.ok && data) return { ok: true, data };
  return { ok: false, error: data?.error ?? "Something went wrong. Please try again.", errors: data?.errors, status: res?.status ?? 0 };
}

export const usd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
export const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** The page key is kept on this device too, so /share/me opens without the link (cleared by "Sign out here"). */
const KEY = "garage-sale-friend-key";
/** The friend's own code on this device, so item pages offer them their link for that item. */
const CODE = "garage-sale-friend-code";
const listeners = new Set<() => void>();
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {
    /* private browsing: the link still works */
  }
};
export const savedKey = () => read(KEY);
export const saveKey = (key: string | null) => write(KEY, key);
export const savedCode = () => read(CODE);
export const saveCode = (code: string | null) => {
  write(CODE, code);
  listeners.forEach((fn) => fn());
};
/** For useSyncExternalStore: this tab's changes, and other tabs' (the storage event). */
export const subscribeCode = (fn: () => void) => {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
};

export type Friend = {
  code: string;
  name: string;
  link: string;
  address: string;
  email: string | null;
  ratePercent: number;
  status: "active" | "paused" | "removed";
  country: string | null;
  usPerson: boolean;
  termsVersion: string | null;
  termsAcceptedAt: string | null;
};
export type Commission = { order: number; at: string; ratePercent: number | null; baseCents: number | null; cents: number | null; state: "pending" | "sent" | "cancelled"; how: "split" | "wallet" | null; bch: string | null; txUrl: string | null; note: string | null };
export type MyPage = {
  partner: Friend;
  totals: { sales: number; paidCents: number; waitingCents: number };
  limit: { limitCents: number; leftCents: number; earnedCents: number; reached: boolean } | null;
  commissions: Commission[];
  open: boolean;
};
