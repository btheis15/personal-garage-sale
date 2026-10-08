/**
 * The server, behind Caddy at PUBLIC_URL. Three kinds of request:
 *
 * Anyone:
 *   GET  /health                 uptime checks
 *   GET  /media/<id>/<w>.webp     photos (the website shows them through its own address)
 *   POST /stripe/webhook          Stripe's signed "paid" / "expired" notices
 *
 * The website (Authorization: Bearer SHOP_API_TOKEN):
 *   GET  /api/catalog             items for sale (+ recently sold), settings, which payments are on
 *   GET  /api/item/:slug          one item, sold ones too
 *   POST /api/checkout            holds the items and starts the payment
 *   GET  /api/orders/:id          the buyer's order page;  POST …/pay, …/cancel, …/stripe-return
 *   POST /api/orders/:id/bch/start · GET …/bch · POST …/bch/:action   Bitcoin Cash
 *
 * The Sell app on the website (Authorization: Bearer SHOP_ADMIN_TOKEN):
 *   /api/admin/items, /photos, /orders, /charge, /settings, /status
 *
 * Prices always come from the database: nothing the browser sends about money is trusted.
 */
import { timingSafeEqual } from "node:crypto";
import express from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import helmet from "helmet";
import multer from "multer";
import { deleteImages, MediaError, saveImage } from "./media.js";
import { CHECKOUT_HOLD_MINUTES, IN_PERSON_HOLD_MINUTES } from "./site.js";
import { buyerView, ShopError } from "./store.js";

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function readCustomer(v) {
  const c = v && typeof v === "object" ? v : {};
  const email = str(c.email, 120);
  return {
    name: str(c.name, 80) || undefined,
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined,
    phone: str(c.phone, 40) || undefined,
    note: str(c.note, 1000) || undefined,
  };
}
const readLines = (v) => (Array.isArray(v) ? v : []).slice(0, 50).map((l) => ({ id: str(l?.id, 40), qty: Number(l?.qty) || 1 }));

export function createApp({ config, store, stripe, bch, notifier, revalidator, partners = null, sanctions = null }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

  const bearer = (token) => (req, res, next) => {
    const h = req.get("authorization") ?? "";
    if (!token || !h.startsWith("Bearer ") || !safeEqual(h.slice(7), token)) return res.status(401).json({ error: "Unauthorized" });
    next();
  };
  const site = bearer(config.siteToken);
  const admin = bearer(config.adminToken);
  // Requests come from the website's servers, which pass on the shopper's address (X-Shopper-IP).
  const shopperKey = (req) => String(req.get("x-shopper-ip") || "").slice(0, 64) || ipKeyGenerator(req.ip ?? "");
  const limit = (perMinute, key = shopperKey) =>
    rateLimit({ windowMs: 60_000, limit: perMinute, keyGenerator: key, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many tries. Wait a minute and try again." } });
  const send = (fn) => async (req, res, next) => {
    try {
      res.set("Cache-Control", "no-store").json(await fn(req, res));
    } catch (e) {
      if (e instanceof ShopError || e instanceof MediaError || (e?.status >= 400 && e.status < 500) || e?.name === "BchError")
        return res.status(e.status ?? 400).json({ error: e.message, ...(e.itemIds ? { itemIds: e.itemIds } : {}), ...(e.errors ? { errors: e.errors } : {}) });
      next(e);
    }
  };
  const fail = (message, status = 400) => {
    throw new ShopError(message, { status });
  };
  const mustOrder = (id) => store.getOrder(id) ?? fail("Order not found.", 404);

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Photos never change once written (a new photo gets a new id), so they're cached for a year.
  app.use("/media", express.static(config.mediaDir, { immutable: true, maxAge: "365d", index: false, dotfiles: "deny" }));

  // What wallets show for a receipt as a CashToken (the website serves it at its own /bcmr/… too).
  app.get("/bcmr/:file", send(async (req, res) => {
    const m = /^([0-9a-f]{64})\.json$/.exec(req.params.file);
    const json = m && bch.enabled ? await bch.registry(m[1]) : null;
    if (!json) fail("Not found.", 404);
    res.set({ "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" });
    return JSON.parse(json);
  }));

  app.post("/stripe/webhook", express.raw({ type: "application/json", limit: "1mb" }), send((req) => stripe.webhook(req.body, req.get("stripe-signature"))));

  // --- The website -------------------------------------------------------------------------

  const web = express.Router();
  web.use(site, express.json({ limit: "64kb" }));

  const payments = () => ({
    stripe: stripe.enabled,
    stripeTest: stripe.enabled && stripe.testMode,
    bch: bch.enabled,
    // Receipts as CashTokens are offered with Bitcoin Cash; "Spread the word" is open.
    bchReceipts: (bch.receiptsOn?.() ?? false),
    partners: (bch.partnersOn?.() ?? false) ? { ratePercent: store.getSettings().partners.ratePercent } : null,
  });

  web.get("/catalog", send(() => ({ items: store.catalog(), settings: store.getSettings(), payments: payments() })));
  web.get("/item/:slug", send((req) => ({ item: store.itemBySlug(req.params.slug) })));

  web.post(
    "/checkout",
    limit(20),
    send(async (req) => {
      const b = req.body ?? {};
      const settings = store.getSettings();
      const customer = readCustomer(b.customer);
      if (!customer.name) fail("Please add your name.");
      if (!customer.email) fail("Please add your email, so I can send your receipt and pickup details.");
      const fulfillment = b.fulfillment === "ship" && settings.shipping ? "ship" : "pickup";
      const base = { lines: readLines(b.lines), customer, fulfillment, defaultShippingCents: settings.defaultShippingCents };
      if (b.method === "pickup") {
        if (!settings.payAtPickup || fulfillment !== "pickup") fail("Pay at pickup isn't available.");
        const order = store.placeOrder({ ...base, status: "reserved", holdMinutes: settings.payAtPickupHours * 60 });
        notifier.reserved(order);
        return { url: `/order/${order.id}` };
      }
      if (b.method === "stripe") {
        if (!stripe.enabled) fail("Card payments aren't available right now.");
        const order = store.placeOrder({ ...base, method: "stripe", holdMinutes: CHECKOUT_HOLD_MINUTES });
        try {
          return { url: await stripe.start(order, { cancelUrl: `${config.siteUrl}/checkout?cancelled=${order.id}` }) };
        } catch (e) {
          store.releaseOrder(order.id);
          throw e;
        }
      }
      if (b.method === "bch") {
        if (!bch.enabled) fail("Bitcoin Cash isn't available right now.");
        // Came through a partner's link (?s=<code>): their commission is paid with this Bitcoin Cash sale.
        const partner = (bch.partnersOn?.() ?? false) && partners ? partners.forCode(str(b.partner, 40)) : null;
        const receiptPref = ["email", "token", "both"].includes(b.receipt) ? b.receipt : "email";
        const order = store.placeOrder({ ...base, method: "bch", holdMinutes: CHECKOUT_HOLD_MINUTES, partnerId: partner?.id ?? null, receiptPref });
        return { url: `/order/${order.id}` };
      }
      fail("Pick how you'd like to pay.");
    }),
  );

  const orders = limit(120);
  web.get("/orders/:id", orders, send((req) => ({ order: buyerView(mustOrder(req.params.id)), payments: payments() })));

  // Back from Stripe: ask Stripe now instead of waiting for its notice.
  web.post("/orders/:id/stripe-return", orders, send(async (req) => {
    const order = mustOrder(req.params.id);
    if (order.status === "pending" && stripe.enabled) await stripe.syncById(str(req.body?.sessionId, 300)).catch(() => null);
    return { order: buyerView(mustOrder(req.params.id)) };
  }));

  // The buyer picks (or switches) how to pay: in-person QR, a shared pay link, or back from Stripe.
  web.post("/orders/:id/pay", limit(20), send(async (req) => {
    let order = mustOrder(req.params.id);
    const method = req.body?.method;
    if (method === "bch" && order.stripeSessionId) order = (await stripe.close(order)) ?? order;
    if (order.status !== "pending") fail(order.status === "paid" || order.status === "completed" ? "This order is already paid." : "This order has closed.", 409);
    if (method === "stripe" && stripe.enabled) {
      if (bch.enabled && (await bch.payment(order.id))) {
        const view = await bch.status(order.id);
        if (!["waiting", "expired"].includes(view.state)) fail("A Bitcoin Cash payment has already arrived for this order.", 409);
        await bch.close(order.id);
      }
      return { url: await stripe.start(order) };
    }
    if (method === "bch" && bch.enabled) {
      store.setOrderFields(order.id, { method: "bch" });
      return { view: await bch.start(store.getOrder(order.id)) };
    }
    fail("That way to pay isn't available.");
  }));

  web.post("/orders/:id/cancel", limit(20), send(async (req) => {
    const order = mustOrder(req.params.id);
    if (!["pending", "reserved"].includes(order.status)) return { status: order.status };
    if (order.method === "bch" && bch.enabled && (await bch.payment(order.id))) {
      const view = await bch.status(order.id).catch(() => null);
      if (view && !["waiting", "expired"].includes(view.state)) fail("A payment has already arrived for this order, so it can't be cancelled here. Please get in touch.", 409);
      await bch.close(order.id).catch(() => {});
    }
    store.releaseOrder(order.id, "cancelled");
    return { status: "cancelled" };
  }));

  const bchOrder = (id) => {
    if (!bch.enabled) fail("Payment not found.", 404);
    const order = mustOrder(id);
    if (order.method !== "bch") fail("Payment not found.", 404);
    return order;
  };
  web.post("/orders/:id/bch/start", orders, send(async (req) => {
    const order = bchOrder(req.params.id);
    if (order.status !== "pending") fail("This order isn't waiting for payment.", 409);
    return bch.start(order);
  }));
  web.get("/orders/:id/bch", orders, send((req) => (bchOrder(req.params.id), bch.status(req.params.id))));
  web.post("/orders/:id/bch/:action", limit(60), send(async (req) => {
    const order = bchOrder(req.params.id);
    const b = req.body ?? {};
    const s = (k) => str(b[k], 20_000);
    switch (req.params.action) {
      case "renew":
        if (order.status !== "pending") fail("This checkout has closed. Please start again from the shop.", 409);
        return bch.renew(order.id);
      case "wallet":
        return bch.walletInfo(order.id, s("address"));
      case "quote":
        return bch.walletQuote(order.id, { category: s("category"), amount: s("amount") });
      case "build":
        return bch.walletBuild(order.id, { address: s("address"), category: s("category"), amount: s("amount") });
      case "submit":
        return bch.walletSubmit(order.id, s("hex"));
      case "receipt":
        return bch.claimReceipt(order.id, s("address"));
      default:
        fail("Not found.", 404);
    }
  }));

  // "Spread the word": sign-up and the partner's own page (their key stays in the page's # part, never a URL).
  if (partners) {
    web.post("/partners/signup", limit(5), send((req) => {
      if (!(bch.partnersOn?.() ?? false)) fail("Spread the word isn't open right now.", 503);
      return partners.signUp(req.body ?? {});
    }));
    web.post("/partners/me", limit(30), send((req) => partners.myPage(str(req.body?.key, 100))));
    web.post("/partners/me/address", limit(10), send((req) => partners.setAddress(str(req.body?.key, 100), str(req.body?.address, 120))));
    web.post("/partners/me/email", limit(10), send((req) => partners.setEmail(str(req.body?.key, 100), str(req.body?.email, 120))));
  }

  // --- The Sell app ---------------------------------------------------------------------------

  const sell = express.Router();
  sell.use(admin, limit(300, () => "admin"));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxImageMb * 1024 * 1024, files: 1 } });

  sell.get("/items", send(() => ({ items: store.listItems(), soldElsewhere: store.soldButListedElsewhere() })));
  sell.post("/items", express.json({ limit: "64kb" }), send((req) => ({ item: store.createItem(req.body ?? {}) })));
  // Many at once, from "Add several": [{ title, priceCents, … }]. All or nothing.
  sell.post("/items/many", express.json({ limit: "256kb" }), send((req) => {
    const list = Array.isArray(req.body?.items) ? req.body.items.slice(0, 50) : [];
    if (!list.length) fail("Nothing to add.");
    list.forEach((b, i) => {
      try {
        store.parseItemInput(b);
      } catch (e) {
        throw new ShopError(`Item ${i + 1}: ${e.message}`);
      }
    });
    return { items: list.map((b) => store.createItem(b)) };
  }));
  sell.get("/items/:id", send((req) => ({ item: store.getItem(req.params.id) ?? fail("Not found.", 404) })));
  sell.patch("/items/:id", express.json({ limit: "64kb" }), send((req) => ({ item: store.updateItem(req.params.id, req.body ?? {}) })));
  sell.delete("/items/:id", send(async (req) => {
    await deleteImages(config, store.deleteItem(req.params.id));
    return { ok: true };
  }));

  sell.post("/photos", upload.single("photo"), send(async (req) => {
    if (!req.file) fail("No photo came through. Try again.");
    return { photo: await saveImage(config, req.file.buffer) };
  }));

  sell.get("/orders", send(() => ({ orders: store.listOrders() })));
  sell.get("/orders/:id", send(async (req) => {
    const order = mustOrder(req.params.id);
    const p = order.method === "bch" && bch.enabled ? await bch.payment(order.id).catch(() => null) : null;
    const commission = p?.partner ? await bch.commission(order.id).catch(() => null) : null;
    const partner = order.partnerId && partners ? partners.byId(order.partnerId) : null;
    return {
      order,
      bch: p ? { address: p.address, events: p.events ?? [], problems: p.problems ?? [], receipt: p.receipt ? { state: p.receipt.state ?? null, to: p.receipt.to ?? null } : null } : null,
      commission: commission ? { ...commission, partnerName: partner?.name ?? null, partnerCode: partner?.code ?? null } : null,
    };
  }));
  sell.patch("/orders/:id", express.json({ limit: "16kb" }), send(async (req) => {
    const order = mustOrder(req.params.id);
    const b = req.body ?? {};
    if (b.action === "paid") {
      if (!["cash", "venmo", "other"].includes(b.method)) fail("Pick how they paid.");
      const changed = store.markPaid(order.id, b.method);
      if (changed) notifier.paid(changed);
    } else if (b.action === "complete") store.completeOrder(order.id);
    else if (b.action === "cancel") {
      if (["paid", "completed"].includes(order.status)) fail("It's paid: refund it first (Stripe dashboard, or send the BCH back), then put the items back for sale.", 409);
      if (order.method === "bch" && bch.enabled) await bch.close(order.id).catch(() => {});
      store.releaseOrder(order.id, "cancelled");
    } else if (b.action === "note") store.setOrderFields(order.id, { notes: str(b.notes, 2000) });
    else fail("Unknown action.");
    return { order: store.getOrder(order.id) };
  }));

  /**
   * Selling in person, or a pay link to send someone: { lines, method, customer? }.
   *   "cash" | "venmo" | "other": recorded as paid straight away.
   *   "link": an order waiting for payment; its page (/order/<id>) is the QR code or link the buyer
   *           opens to pay by card or Bitcoin Cash. Held IN_PERSON_HOLD_MINUTES, or `holdHours` for a link sent by text.
   */
  sell.post("/charge", express.json({ limit: "16kb" }), send((req) => {
    const b = req.body ?? {};
    const lines = readLines(b.lines);
    const customer = readCustomer(b.customer);
    if (b.method === "link") {
      const hours = Number(b.holdHours);
      const holdMinutes = hours >= 1 && hours <= 72 ? Math.round(hours * 60) : IN_PERSON_HOLD_MINUTES;
      return { order: store.placeOrder({ lines, channel: "in_person", customer, holdMinutes }) };
    }
    if (!["cash", "venmo", "other"].includes(b.method)) fail("Pick how they're paying.");
    const order = store.placeOrder({ lines, method: b.method, channel: "in_person", customer, holdMinutes: 10 });
    const paid = store.markPaid(order.id, b.method) ?? order;
    notifier.paid(paid);
    return { order: paid };
  }));

  // Receipts as CashTokens: the collection is made once, from the hot wallet.
  sell.get("/receipts", send(async () => ({ receipts: await bch.receiptsStatus?.() ?? null, hotWallet: bch.enabled ? await bch.hotWalletStatus() : null })));
  sell.post("/receipts", express.json({ limit: "8kb" }), send(async (req) => {
    if (!bch.enabled) fail("Set BCH_XPUB first.", 409);
    return { receipts: await bch.createReceipts(req.body ?? {}) };
  }));

  // "Spread the word": who's sharing the sale, what they've earned; pause one or give them their own rate.
  sell.get("/partners", send(() => ({ partners: partners ? partners.list() : [], on: (bch.partnersOn?.() ?? false), hotWallet: Boolean(bch.hotWallet), sanctions: sanctions?.status() ?? null })));
  sell.get("/partners/:id", send((req) => ({ commissions: partners ? partners.commissionsFor(req.params.id) : [] })));
  sell.patch("/partners/:id", express.json({ limit: "8kb" }), send((req) => {
    if (!partners) fail("Not found.", 404);
    return { partner: partners.update(req.params.id, req.body ?? {}) };
  }));

  sell.get("/settings", send(() => ({ settings: store.getSettings() })));
  sell.put("/settings", express.json({ limit: "32kb" }), send(async (req) => {
    const settings = store.saveSettings(req.body ?? {});
    await bch.syncReceiptLook?.().catch((e) => console.error("[bch] receipt look:", e.message));
    return { settings };
  }));
  sell.get("/status", send(() => ({
    server: true,
    stripe: stripe.enabled ? (stripe.testMode ? "test" : "live") : null,
    stripeWebhook: Boolean(config.stripeWebhookSecret),
    bch: bch.enabled,
    bchFirstAddress: bch.enabled ? bch.firstAddress() : null,
    hotWallet: bch.enabled ? Boolean(bch.hotWallet) : false,
    receipts: bch.enabled ? (bch.receiptsOn?.() ?? false) : false,
    partners: bch.enabled ? (bch.partnersOn?.() ?? false) : false,
    email: notifier.enabled,
    publicUrl: config.publicUrl || null,
    website: revalidator.status(),
  })));
  // The Sell app's routes first: the website's router checks its own token on everything under /api.
  app.use("/api/admin", sell);
  app.use("/api", web);

  app.use((_req, res) => res.status(404).json({ error: "Not found." }));
  app.use((err, _req, res, _next) => {
    if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: `That photo is over ${config.maxImageMb} MB.` });
    console.error(err);
    res.status(500).json({ error: "Something went wrong on the server." });
  });
  return app;
}

