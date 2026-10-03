/**
 * Bitcoin Cash, straight into your own wallet: the bch_cashtoken_checkout engine (src/bch-engine),
 * with its storage in the SQLite database. BCH_XPUB in .env is your wallet's xPub: it lists the
 * wallet's addresses but can't spend. Each order gets its own address; this Mac watches the
 * blockchain through public Fulcrum servers and accepts a payment at zero-conf once no
 * double-spend proof turns up within a few seconds. Coupons and rewards are left off.
 */
import { createBchCheckout } from "./bch-engine/checkout.js";
import { parseXpub } from "./bch-engine/bch.js";

/** The engine's storage interface (bch-engine/memory-store.js), in SQLite. */
export function createSqliteBchStore(db) {
  const row = (r) => (r ? { wallet: r.wallet, index: r.idx, address: r.address, scripthash: r.scripthash, state: r.state, orderId: r.order_id, reservedAt: r.reserved_at, releasedAt: r.released_at } : null);
  const claimFree = db.transaction((wallet, orderId, reuseBefore, at) => {
    const r = db.prepare("select * from bch_addresses where wallet = ? and state = 'free' and (released_at is null or released_at < ?) order by idx limit 1").get(wallet, reuseBefore);
    if (!r) return null;
    db.prepare("update bch_addresses set state = 'reserved', order_id = ?, reserved_at = ?, released_at = null where wallet = ? and idx = ?").run(orderId, at, wallet, r.idx);
    return { ...row(r), state: "reserved", orderId, reservedAt: at, releasedAt: null, previous: { orderId: r.order_id, releasedAt: r.released_at } };
  });
  const claimNew = db.transaction((wallet, orderId, at, derive) => {
    const index = (db.prepare("select max(idx) as i from bch_addresses where wallet = ?").get(wallet).i ?? -1) + 1;
    const a = derive(index);
    db.prepare("insert into bch_addresses (wallet, idx, address, scripthash, state, order_id, reserved_at) values (?, ?, ?, ?, 'reserved', ?, ?)").run(wallet, index, a.address, a.scripthash, orderId, at);
    return { wallet, index, address: a.address, scripthash: a.scripthash, state: "reserved", orderId, reservedAt: at, releasedAt: null };
  });
  return {
    async getPayment(id) {
      const r = db.prepare("select data from bch_payments where id = ?").get(id);
      return r ? JSON.parse(r.data) : null;
    },
    async putPayment(p) {
      db.prepare("insert into bch_payments (id, data, created_at) values (?, ?, ?) on conflict(id) do update set data = excluded.data").run(p.id, JSON.stringify(p), p.createdAt);
    },
    async listPayments({ since }) {
      return db.prepare("select data from bch_payments where created_at >= ?").all(since).map((r) => JSON.parse(r.data));
    },
    async claimFreeAddress(wallet, orderId, reuseBefore, at) {
      return claimFree(wallet, orderId, reuseBefore, at);
    },
    async claimNewAddress(wallet, orderId, at, derive) {
      return claimNew(wallet, orderId, at, derive);
    },
    async setAddress(wallet, index, patch) {
      const cols = { state: "state", orderId: "order_id", releasedAt: "released_at" };
      for (const [k, c] of Object.entries(cols)) if (patch[k] !== undefined) db.prepare(`update bch_addresses set ${c} = ? where wallet = ? and idx = ?`).run(patch[k], wallet, index);
    },
    async releaseAddress(orderId, releasedAt) {
      db.prepare("update bch_addresses set state = 'free', released_at = ? where order_id = ? and state = 'reserved'").run(releasedAt, orderId);
    },
    async markAddressUsed(orderId) {
      db.prepare("update bch_addresses set state = 'used' where order_id = ?").run(orderId);
    },
    async orderForScripthash(scripthash) {
      return db.prepare("select order_id from bch_addresses where scripthash = ? and order_id is not null order by reserved_at desc limit 1").get(scripthash)?.order_id ?? null;
    },
    async unusedAhead(wallet) {
      const all = db.prepare("select idx, state from bch_addresses where wallet = ?").all(wallet);
      const lastUsed = Math.max(-1, ...all.filter((a) => a.state === "used").map((a) => a.idx));
      return all.filter((a) => a.idx > lastUsed && a.state !== "used").length;
    },
    async getMeta(name) {
      const r = db.prepare("select value from bch_meta where name = ?").get(name);
      return r ? JSON.parse(r.value) : null;
    },
    async putMeta(name, value) {
      db.prepare("insert into bch_meta (name, value) values (?, ?) on conflict(name) do update set value = excluded.value").run(name, JSON.stringify(value));
    },
  };
}

export function createBch({ config, db, store, notifier, chain, prices, engineOptions = {} }) {
  let enabled = false;
  if (config.bchXpub) {
    try {
      parseXpub(config.bchXpub);
      enabled = true;
    } catch (e) {
      console.error(`[bch] BCH_XPUB isn't a usable xPub (${e.message}); Bitcoin Cash is off.`);
    }
  }
  if (!enabled) return { enabled: false };

  const engine = createBchCheckout({
    xpub: config.bchXpub,
    store: createSqliteBchStore(db),
    ...(chain ? { chain } : {}),
    ...(prices ? { prices } : {}),
    onPaid: (p) => {
      const changed = store.markPaid(p.id, "bch");
      if (changed) notifier.paid(changed);
    },
    onNotice: (p, n) => n.problem && console.warn(`[bch] order ${p.id}: ${n.message}`),
    ...engineOptions,
  });

  /** Starts the order's payment (an address and a price), or returns the one already going. */
  async function start(order) {
    if (await engine.payment(order.id)) return engine.check(order.id);
    return engine.start({
      id: order.id,
      label: `Order ${order.number}`,
      subtotalCents: order.subtotalCents,
      shippingCents: order.shippingCents,
      itemCount: order.items.reduce((n, i) => n + i.qty, 0),
      shippingLabel: order.shippingCents ? "Shipping" : null,
      number: order.number,
      items: order.items.map((i) => ({ title: i.title, option: null, qty: i.qty, unitCents: i.priceCents })),
    });
  }

  // The payment screen asks every few seconds: one look at the blockchain per order every 3 seconds.
  const recent = new Map();
  async function status(id) {
    const r = recent.get(id);
    if (r && Date.now() - r.at < 3000 && r.view.state !== "arrived") return r.view;
    const view = await engine.check(id);
    recent.set(id, { at: Date.now(), view });
    if (recent.size > 500) recent.delete(recent.keys().next().value);
    return view;
  }

  let timer = null;
  return {
    enabled: true,
    firstAddress: () => engine.firstAddress(),
    start,
    status,
    payment: (id) => engine.payment(id),
    renew: (id) => engine.renew(id),
    close: (id) => engine.close(id),
    walletInfo: (id, address) => engine.walletInfo(id, address),
    walletQuote: (id, input) => engine.walletQuote(id, input),
    walletBuild: (id, input) => engine.walletBuild(id, input),
    walletSubmit: (id, hex) => engine.walletSubmit(id, hex),
    async run() {
      await engine.watchAll().catch((e) => console.error("[bch] watch:", e.message));
      timer = setInterval(() => engine.tick().catch((e) => console.error("[bch] tick:", e.message)), 60_000);
    },
    stop() {
      clearInterval(timer);
      engine.stop();
    },
  };
}
