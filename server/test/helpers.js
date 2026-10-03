import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import { createStore } from "../src/store.js";

export const SITE = "s".repeat(40);
export const ADMIN = "a".repeat(40);

/** A whole server on a free port, with stand-ins for Stripe, Bitcoin Cash and email. */
export async function startServer({ stripe = fakeStripe(), bch = { enabled: false } } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "gs-test-"));
  const config = loadConfig({ dataDir: dir, siteToken: SITE, adminToken: ADMIN, siteUrl: "https://shop.test" });
  const db = openDb(":memory:");
  const sent = [];
  const notifier = { enabled: true, paid: (o) => sent.push(["paid", o.number]), reserved: (o) => sent.push(["reserved", o.number]) };
  const store = createStore(db);
  const s = typeof stripe === "function" ? stripe(store) : stripe;
  const b = typeof bch === "function" ? bch(store, db) : bch;
  const app = createApp({ config, store, stripe: s, bch: b, notifier, revalidator: { status: () => ({ state: "idle" }) } });
  const server = await new Promise((resolve) => {
    const srv = app.listen(0, "127.0.0.1", () => resolve(srv));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (token) => async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return {
    base,
    store,
    sent,
    config,
    site: call(SITE),
    admin: call(ADMIN),
    anon: call(null),
    async close() {
      b.stop?.();
      await new Promise((r) => server.close(r));
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function fakeStripe() {
  return (store) => ({
    enabled: true,
    testMode: true,
    started: [],
    async start(order) {
      store.setOrderFields(order.id, { stripeSessionId: `cs_test_${order.number}`, method: "stripe" });
      return `https://checkout.stripe.test/${order.number}`;
    },
    async syncById() {
      return null;
    },
    async close(order) {
      store.setOrderFields(order.id, { stripeSessionId: null });
      return store.getOrder(order.id);
    },
    async webhook() {
      return { received: true };
    },
  });
}

export const jpeg = (w = 800, h = 600) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg().toBuffer();

export async function uploadPhoto(t, buffer) {
  const form = new FormData();
  form.append("photo", new Blob([buffer], { type: "image/jpeg" }), "p.jpg");
  const res = await fetch(`${t.base}/api/admin/photos`, { method: "POST", headers: { Authorization: `Bearer ${ADMIN}` }, body: form });
  return { status: res.status, body: await res.json() };
}
