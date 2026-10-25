"use client";

import { useEffect, useState } from "react";
import { sellApi } from "./api";

/**
 * "Notifications on this phone": a buzz when something's held for pickup, sold online, or a hold is
 * cancelled. On an iPhone, web apps can only get notifications when opened from their home-screen
 * icon (iOS 16.4+), so outside it this explains how.
 */
type State = "loading" | "unsupported" | "needs-home-screen" | "blocked" | "off" | "on";

const SW = "/sell-sw.js";

function base64ToBytes(b64: string) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function phoneName() {
  const ua = navigator.userAgent;
  return /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android phone" : /Mac/.test(ua) ? "Mac" : "This device";
}

export function PhoneNotifications() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState(ios && !standalone ? "needs-home-screen" : "unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.getRegistration("/sell");
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) return setState("off");
      // Still known to the Mac mini? (It forgets phones that turned notifications off.)
      const { on } = await sellApi<{ on: boolean }>("POST", "/api/sell/push", { action: "check", endpoint: sub.endpoint }).catch(() => ({ on: true }));
      setState(on ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function turnOn() {
    setBusy(true);
    setMsg(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        throw new Error("Notifications weren't allowed.");
      }
      const reg = await navigator.serviceWorker.register(SW, { scope: "/sell", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      const { publicKey } = await sellApi<{ publicKey: string | null }>("GET", "/api/sell/push");
      if (!publicKey) throw new Error("The Mac mini isn't ready for notifications yet (update it first).");
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(publicKey) }));
      await sellApi("POST", "/api/sell/push", { subscription: sub.toJSON(), label: phoneName() });
      setState("on");
      setMsg({ ok: true, text: "On. Sending a test notification…" });
      await sellApi("POST", "/api/sell/push/test", {});
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy(false);
  }

  async function turnOff() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sell");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await sellApi("POST", "/api/sell/push", { action: "off", endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    try {
      const { sent } = await sellApi<{ sent: number }>("POST", "/api/sell/push/test", {});
      setMsg(sent ? { ok: true, text: "Sent. It should show up in a few seconds." } : { ok: false, text: "No phones are signed up. Turn it off and on again." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy(false);
  }

  return (
    <section className="mt-6 space-y-3 rounded-2xl border border-line bg-white p-4">
      <div>
        <p className="font-bold">Notifications on this phone</p>
        <p className="text-sm text-muted">A buzz when something&apos;s held for pickup, sold online, or a hold is cancelled.</p>
      </div>
      {state === "loading" && <p className="text-sm text-muted">Checking…</p>}
      {state === "needs-home-screen" && (
        <p className="rounded-xl bg-sun p-3 text-sm">
          On an iPhone, open Sell from its <b>home-screen icon</b> to turn these on (in Safari: Share → Add to Home Screen, then open it from there).
        </p>
      )}
      {state === "unsupported" && <p className="rounded-xl bg-kraft p-3 text-sm">This browser can&apos;t get notifications. Try Safari on the iPhone (from the home-screen icon) or Chrome.</p>}
      {state === "blocked" && (
        <p className="rounded-xl bg-sun p-3 text-sm">
          Notifications are blocked for Sell. On an iPhone: Settings → Notifications → Sell → Allow Notifications. Then come back here.
        </p>
      )}
      {state === "off" && (
        <button type="button" onClick={turnOn} disabled={busy} className="btn btn-primary w-full">
          {busy ? "One moment…" : "Turn on notifications"}
        </button>
      )}
      {state === "on" && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={test} disabled={busy} className="btn btn-outline">
            Send a test
          </button>
          <button type="button" onClick={turnOff} disabled={busy} className="btn btn-outline">
            Turn off
          </button>
        </div>
      )}
      {msg && <p className={`rounded-xl p-3 text-sm font-bold ${msg.ok ? "bg-leaf-light text-leaf" : "bg-berry/10 text-berry"}`}>{msg.text}</p>}
    </section>
  );
}
