/**
 * Bitcoin Cash, straight into your own wallet: the bch_cashtoken_checkout engine (src/bch-engine),
 * with its storage in the SQLite database. BCH_XPUB in .env is your wallet's xPub: it lists the
 * wallet's addresses but can't spend. Each order gets its own address; this Mac watches the
 * blockchain through public Fulcrum servers and accepts a payment at zero-conf once no
 * double-spend proof turns up within a few seconds. Coupons and rewards are left off.
 */
import { createBchChain, parseXpub } from "./bch-engine/bch.js";
import { createBchCheckout } from "./bch-engine/checkout.js";
import { createHotWallet } from "./bch-engine/hot-wallet.js";
import { createReceiptIssuer } from "./bch-engine/receipts.js";
import { createSanctions } from "./bch-engine/sanctions.js";

/**
 * The US sanctions list (OFAC SDN), for partners' payout addresses: downloaded at most once a day, kept in the
 * database so a failed download keeps the last list.
 */
export function createSanctionsList(db, options = {}) {
  const KEY = "ofac";
  return createSanctions({
    getMeta: () => {
      const r = db.prepare("select value from bch_meta where name = ?").get(KEY);
      return r ? JSON.parse(r.value) : null;
    },
    setMeta: (v) => db.prepare("insert into bch_meta (name, value) values (?, ?) on conflict(name) do update set value = excluded.value").run(KEY, JSON.stringify(v)),
    log: (m) => console.warn(m),
    ...options,
  });
}

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

/**
 * Bitcoin Cash for the garage sale. Receipts as CashTokens and partners' commissions need the hot wallet
 * (BCH_HOT_WALLET_WIF): a small wallet whose key is on this Mac, holding only a little BCH for them.
 */
export function createBch({ config, db, store, notifier, chain: givenChain, prices, engineOptions = {}, partners = null, sanctions = null }) {
  let enabled = false;
  if (config.bchXpub) {
    try {
      parseXpub(config.bchXpub);
      enabled = true;
    } catch (e) {
      console.error(`[bch] BCH_XPUB isn't a usable xPub (${e.message}); Bitcoin Cash is off.`);
    }
  }
  if (!enabled) return { enabled: false, receiptsOn: () => false, partnersOn: () => false };

  const chain = givenChain ?? createBchChain();
  const bchStore = createSqliteBchStore(db);
  let wallet = null;
  if (config.bchHotWalletWif) {
    try {
      wallet = createHotWallet({ wif: config.bchHotWalletWif, chain });
      wallet.info();
    } catch (e) {
      console.error(`[bch] BCH_HOT_WALLET_WIF isn't a usable key (${e.message}); receipts and commissions are off.`);
      wallet = null;
    }
  }
  const settings = () => store.getSettings();
  /** What each receipt carries besides the order: the note and contact come from Settings. */
  const receiptLook = (s) => ({ note: s.receiptNote ?? "", contact: s.contactEmail || s.contactPhone || "", returns: "Used items, sold as is: all sales final.", website: true, reward: false });
  const receipts = wallet
    ? createReceiptIssuer({
        wallet,
        store: bchStore,
        siteUrl: () => config.siteUrl,
        shopName: settings().name,
        look: receiptLook(settings()),
      })
    : null;

  const engine = createBchCheckout({
    xpub: config.bchXpub,
    store: bchStore,
    chain,
    ...(prices ? { prices } : {}),
    receipts,
    commissions: wallet && partners ? { wallet, isBlocked: (a) => sanctions?.isBlocked(a) ?? false, onCommission: (p, c) => partners.record(store.getOrder(p.id), c) } : null,
    onPaid: (p) => {
      const changed = store.markPaid(p.id, "bch");
      if (!changed) return;
      // Through a partner's link: on their page as "on its way" until the engine reports it sent.
      if (p.partner && partners) partners.record(changed, { partnerId: p.partner.id, ratePercent: p.partner.ratePercent, state: "pending" });
      // The buyer chose the CashToken alone and it's going straight to their wallet: no receipt email.
      notifier.paid(changed, { skipBuyer: engine.receiptReplacesEmail(p) });
    },
    onNotice: (p, n) => n.problem && console.warn(`[bch] order ${p.id}: ${n.message}`),
    ...engineOptions,
  });

  /** Receipts as CashTokens are offered once the collection exists. */
  let receiptsReady = false;
  const refreshReceipts = async () => {
    receiptsReady = Boolean(receipts && (await receipts.status().catch(() => null))?.collection);
    return receiptsReady;
  };
  void refreshReceipts();

  /** Starts the order's payment (an address and a price), or returns the one already going. */
  async function start(order) {
    if (await engine.payment(order.id)) return engine.check(order.id);
    const receipt = receiptsReady ? (order.receiptPref ?? (order.customer?.email ? "email" : "token")) : "email";
    return engine.start({
      id: order.id,
      label: `Order ${order.number}`,
      subtotalCents: order.subtotalCents,
      shippingCents: order.shippingCents,
      itemCount: order.items.reduce((n, i) => n + i.qty, 0),
      shippingLabel: order.shippingCents ? "Shipping" : null,
      number: order.number,
      items: order.items.map((i) => ({ title: i.title, option: null, qty: i.qty, unitCents: i.priceCents })),
      receipt,
      partner: wallet && partners ? partners.forPayment(order.partnerId) : null,
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
    hotWallet: Boolean(wallet),
    receiptsOn: () => receiptsReady,
    partnersOn: () => Boolean(wallet && partners && settings().partners.enabled),
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
    claimReceipt: (id, address) => engine.claimReceipt(id, address),
    commission: (id) => engine.commission(id),
    /** What wallets read about a receipt collection (served at /bcmr/<category>.json). */
    registry: (category) => (receipts ? receipts.registry(category) : null),
    /** The hot wallet for Settings: its address and what it holds. */
    async hotWalletStatus() {
      if (!wallet) return null;
      const w = wallet.info();
      return { address: w.address, balance: await wallet.balance() };
    },
    /** After Settings are saved: the next receipts carry the new note and contact (no transaction). */
    async syncReceiptLook() {
      if (!receipts || !(await refreshReceipts())) return;
      const want = receiptLook(settings());
      const have = await receipts.look();
      if (want.note !== have.note || want.contact !== have.contact) await receipts.update({ look: { note: want.note, contact: want.contact } });
    },
    async receiptsStatus() {
      return receipts ? receipts.status() : null;
    },
    /** Makes the receipt collection (once): "<Shop> Receipt", with the shop's icon. */
    async createReceipts(input = {}) {
      if (!receipts) throw Object.assign(new Error("Set BCH_HOT_WALLET_WIF first (npm run new-hot-wallet), and send it a little BCH."), { status: 409 });
      const s = settings();
      const out = await receipts.create({
        name: String(input.name || `${s.name} Receipt`).slice(0, 60),
        description: String(input.description || `Your receipt from ${s.name}: what you bought, what you paid, and when. One of a kind.`).slice(0, 300),
        icon: input.icon || (config.siteUrl ? `${config.siteUrl}/receipt-token.png` : undefined),
      });
      await refreshReceipts();
      return out;
    },
    async run() {
      await engine.watchAll().catch((e) => console.error("[bch] watch:", e.message));
      timer = setInterval(() => {
        engine.tick().catch((e) => console.error("[bch] tick:", e.message));
        void refreshReceipts();
      }, 60_000);
    },
    stop() {
      clearInterval(timer);
      engine.stop();
    },
  };
}
