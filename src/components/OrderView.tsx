"use client";

import "./bch/bch-pay.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BuyerOrder } from "@/lib/types";
import { money, PAY_METHOD_LABEL } from "@/lib/site";
import type { BchApi } from "./bch/api";
import { BchPay } from "./bch/BchPay";
import type { BchView } from "./bch/types";
import { createBchWalletConnect } from "./bch/walletConnect";
import { cart } from "./cart/store";
import { CheckIcon } from "./icons";
import { ItemPhoto } from "./ItemPhoto";

type Shop = { name: string; pickupInstructions: string; pickupArea: string; venmo: string; contactEmail: string; contactPhone: string };

function bchApi(orderId: string): BchApi {
  const at = `/api/orders/${encodeURIComponent(orderId)}/bch`;
  async function call<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${at}${path}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" } : { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
    return data;
  }
  const none = () => Promise.reject(new Error("Not offered here."));
  return {
    status: () => call(""),
    renew: () => call("/renew", {}),
    wallet: (address) => call("/wallet", { address }),
    quote: (input) => call("/quote", input),
    build: (input) => call("/build", input),
    submit: (hex) => call("/submit", { hex }),
    claim: none,
    receipt: none,
  };
}

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function OrderView({
  initial,
  bch: initialBch,
  shop,
  can,
  walletConnectProjectId,
  returnedFromCard,
}: {
  initial: BuyerOrder;
  bch: unknown;
  shop: Shop;
  can: { stripe: boolean; bch: boolean };
  walletConnectProjectId: string;
  returnedFromCard: boolean;
}) {
  const router = useRouter();
  const [order, setOrder] = useState(initial);
  const [bchView, setBchView] = useState<BchView | null>(initialBch as BchView | null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const api = useMemo(() => bchApi(order.id), [order.id]);
  const wc = useMemo(
    () => (walletConnectProjectId && typeof window !== "undefined" ? createBchWalletConnect({ projectId: walletConnectProjectId, name: shop.name, icon: `${window.location.origin}/icon.png` }) : null),
    [walletConnectProjectId, shop.name],
  );

  const paid = order.status === "paid" || order.status === "completed";
  useEffect(() => {
    if (paid || order.status === "reserved") cart.clear();
  }, [paid, order.status]);

  // Back from Stripe before its notice arrived: look again every few seconds.
  const refresh = useCallback(async () => {
    const res = await fetch(`/api/orders/${order.id}`, { cache: "no-store" });
    if (res.ok) setOrder(await res.json());
  }, [order.id]);
  useEffect(() => {
    if (order.status !== "pending" || order.method === "bch") return;
    const t = setInterval(refresh, returnedFromCard ? 2500 : 8000);
    return () => clearInterval(t);
  }, [order.status, order.method, returnedFromCard, refresh]);

  async function pay(method: "stripe" | "bch") {
    setBusy(method);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/pay`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setBchView(data.view);
      setOrder((o) => ({ ...o, method: "bch" }));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  async function cancel() {
    if (!confirm("Cancel this order? The items go back in the shop.")) return;
    setBusy("cancel");
    setError(null);
    const res = await fetch(`/api/orders/${order.id}/cancel`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error ?? "Couldn't cancel it.");
    await refresh();
    setBusy(null);
    router.refresh();
  }

  const contact = shop.contactPhone ? `text ${shop.contactPhone}` : shop.contactEmail ? `email ${shop.contactEmail}` : null;

  return (
    <div className="container-page max-w-2xl py-8 md:py-12">
      {paid ? (
        <div className="animate-pop rounded-xl bg-leaf-light p-6 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-leaf text-white">
            <CheckIcon size={30} strokeWidth={3} />
          </span>
          <h1 className="mt-3 text-3xl">It&apos;s yours{order.name ? `, ${order.name.split(" ")[0]}` : ""}!</h1>
          <p className="mt-1 text-ink/80">
            Order #{order.number} is paid{order.method ? ` (${PAY_METHOD_LABEL[order.method]})` : ""}. Thank you!
          </p>
        </div>
      ) : order.status === "reserved" ? (
        <div className="rounded-xl bg-sky/10 p-6 text-center">
          <h1 className="text-3xl">On hold for you</h1>
          <p className="mt-1">
            Order #{order.number} is held{order.holdUntil ? ` until ${when(order.holdUntil)}` : ""}. Pay {money(order.totalCents)} at pickup: cash{shop.venmo ? ` or Venmo (${shop.venmo})` : ""}.
          </p>
        </div>
      ) : order.status === "cancelled" || order.status === "expired" ? (
        <div className="rounded-xl bg-kraft p-6 text-center">
          <h1 className="text-3xl">This order {order.status === "expired" ? "timed out" : "was cancelled"}</h1>
          <p className="mt-1 text-muted">Nothing was charged. If the items are still for sale, you can buy them again.</p>
          <Link href="/shop" className="btn btn-primary mt-4">
            Back to the shop
          </Link>
        </div>
      ) : (
        <div>
          <h1 className="text-3xl">{order.channel === "in_person" ? `Pay ${shop.name}` : `Order #${order.number}`}</h1>
          <p className="mt-1 text-muted">
            {order.holdUntil ? `Held for you until ${new Date(order.holdUntil).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} while you pay.` : "Waiting for payment."}
          </p>
        </div>
      )}

      {order.status === "pending" && order.method === "bch" && bchView && (
        <div className="mt-6">
          <BchPay
            api={api}
            initial={bchView}
            brand={{ name: shop.name, logo: "/icon.png", contactUrl: "/about" }}
            wc={wc}
            onPaid={() => {
              cart.clear();
              setTimeout(() => {
                refresh();
                router.refresh();
              }, 2500);
            }}
            style={
              {
                "--bchpay-bg": "#ffffff",
                "--bchpay-soft": "#efece5",
                "--bchpay-line": "#e2ded5",
                "--bchpay-ink": "#22272e",
                "--bchpay-muted": "#646b73",
                "--bchpay-accent": "#2b4c6f",
                "--bchpay-accent-light": "#e7eef5",
                "--bchpay-accent-2": "#3d7a4f",
                "--bchpay-ok": "#3d7a4f",
                "--bchpay-font": "var(--font-sans)",
                "--bchpay-font-display": "var(--font-display)",
              } as React.CSSProperties
            }
          />
        </div>
      )}

      {order.status === "pending" && (order.method !== "bch" || !bchView) && (
        <div className="mt-6 space-y-3">
          {returnedFromCard ? (
            <p className="rounded-lg bg-white p-5 text-center shadow-sm">Confirming your payment with Stripe…</p>
          ) : (
            <>
              <p className="font-bold">
                {order.method === "stripe" ? "Finish paying, or pay another way:" : order.method === "bch" ? "Couldn't reach the Bitcoin Cash network just now. Try again:" : "How would you like to pay?"}
              </p>
              {can.stripe && (
                <button type="button" className="btn btn-primary w-full" disabled={busy !== null} onClick={() => pay("stripe")}>
                  {busy === "stripe" ? "Opening…" : `Card, Apple Pay or Google Pay · ${money(order.totalCents)}`}
                </button>
              )}
              {can.bch && (
                <button type="button" className="btn btn-dark w-full" disabled={busy !== null} onClick={() => pay("bch")}>
                  {busy === "bch" ? "Getting a price…" : "Bitcoin Cash"}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-berry/10 p-3 text-sm font-bold text-berry">
          {error}
        </p>
      )}

      <section className="mt-8 rounded-lg border border-line bg-white p-5">
        <ul className="divide-y divide-line">
          {order.items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-3">
              <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-kraft">
                <ItemPhoto url={i.photoUrl} alt="" sizes="56px" />
              </div>
              <p className="min-w-0 flex-1 leading-snug">
                {i.qty > 1 && `${i.qty} × `}
                {i.title}
              </p>
              <p className="font-bold">{money(i.priceCents * i.qty)}</p>
            </li>
          ))}
        </ul>
        {order.shippingCents > 0 && (
          <p className="flex justify-between border-t border-line pt-3">
            <span>Shipping</span>
            <span>{money(order.shippingCents)}</span>
          </p>
        )}
        <p className="flex justify-between border-t border-line pt-3 text-xl font-bold">
          <span>Total</span>
          <span>{money(order.totalCents)}</span>
        </p>
      </section>

      {(paid || order.status === "reserved") && (
        <section className="mt-6 rounded-lg bg-kraft p-5">
          <h2 className="text-xl">{order.fulfillment === "ship" ? "Shipping" : "Pickup"}</h2>
          <p className="mt-2 whitespace-pre-line">
            {order.fulfillment === "ship" ? "I'll ship it in the next couple of days and email you the tracking number." : shop.pickupInstructions}
          </p>
          {contact && <p className="mt-3 text-sm text-muted">Questions? {contact.charAt(0).toUpperCase() + contact.slice(1)}.</p>}
        </section>
      )}

      {(order.status === "reserved" || (order.status === "pending" && order.channel === "web")) && (
        <p className="mt-6 text-center">
          <button type="button" onClick={cancel} disabled={busy !== null} className="text-sm text-muted underline underline-offset-4">
            {busy === "cancel" ? "Cancelling…" : "Cancel this order"}
          </button>
        </p>
      )}
    </div>
  );
}
