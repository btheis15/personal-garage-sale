/**
 * Live Shippo shipping, ported from Om Threads: real prices at checkout (up to three), the label bought
 * automatically once an order is paid, and the owner's by-hand label tools in the Sell app.
 * Off until Settings → liveShipping is on AND the Shippo key for the current mode exists AND the
 * ship-from address is complete; until then the flat per-item/default shipping applies, unchanged.
 *
 * Keys: SHIPPO_TEST_KEY whenever Stripe is in test mode, SHIPPO_API_KEY (live) only when Stripe is live.
 * A live label is never bought for a test order: the key's own prefix is checked against the mode.
 */
import { createHash, randomBytes } from "node:crypto";
import { createShippo, shippoKeyMode, trackingUrl } from "./shippo.js";
import { discountFor, findCoupon } from "./coupons.js";
import { ShopError } from "./store.js";

export const QUOTE_MINUTES = 30;

const sha256 = (v) => createHash("sha256").update(v).digest("hex");
const norm = (v) => String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const clip = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** The shopper's address, checked: US only. Throws 400 with errors keyed line1/city/state/postal_code. */
export function readAddress(v) {
  const a = v && typeof v === "object" ? v : {};
  const out = { line1: clip(a.line1, 100), line2: clip(a.line2, 100), city: clip(a.city, 60), state: clip(a.state, 20).toUpperCase(), postal_code: clip(a.postal_code, 10), country: "US" };
  const errors = {};
  if (!out.line1) errors.line1 = "Add your street address.";
  if (!out.city) errors.city = "Add your city.";
  if (!/^[A-Z]{2}$/.test(out.state)) errors.state = "Use the 2-letter state, like WI.";
  if (!/^\d{5}(-\d{4})?$/.test(out.postal_code)) errors.postal_code = "Add a 5-digit ZIP code.";
  if (Object.keys(errors).length) throw new ShopError("Please check your shipping address.", { status: 400, errors });
  return out;
}

/**
 * The partial address Apple Pay / Google Pay share before the shopper approves (no street): US only, a 5-digit ZIP is needed,
 * city and state are optional. Throws 400 with errors keyed postal_code.
 */
export function readPartialAddress(v) {
  const a = v && typeof v === "object" ? v : {};
  const country = clip(a.country, 2).toUpperCase() || "US";
  const out = { city: clip(a.city, 60), state: clip(a.state, 20).toUpperCase(), postal_code: clip(a.postal_code, 10), country: "US" };
  if (country !== "US" || !/^\d{5}(-?\d{4})?$/.test(out.postal_code)) throw new ShopError("Choose a US shipping address with a ZIP code.", { status: 400, errors: { postal_code: "Needed to price the shipping (US only)." } });
  if (out.state && !/^[A-Z]{2}$/.test(out.state)) out.state = "";
  return out;
}
/** A ZIP to compare: its first five digits (the sheet may share only the ZIP, the full address has ZIP+4). */
const zip5 = (p) => String(p ?? "").replace(/\D/g, "").slice(0, 5);

export const shipFromReady = (f) => Boolean(f?.name && f.street1 && f.city && f.state && f.zip && f.phone && f.email);

/** The parcel for a cart: Σ qty × (item weight ?? usual package weight), in the largest item box (by volume), else the usual box. */
export function parcelFor(settings, items) {
  const p = settings.package;
  const weightOz = Math.round(items.reduce((n, i) => n + i.qty * (i.weightOz ?? p.weightOz), 0) * 100) / 100;
  let box = [p.lengthIn, p.widthIn, p.heightIn];
  let best = 0;
  for (const i of items) {
    if (!i.box) continue;
    const vol = i.box[0] * i.box[1] * i.box[2];
    if (vol > best) {
      best = vol;
      box = i.box;
    }
  }
  return { lengthIn: box[0], widthIn: box[1], heightIn: box[2], weightOz };
}

/** A shipment's rates in the shape we keep. Overnight comes back as 0 days: shown as 1 business day (as Om Threads does). */
export const ratesOf = (shipment) =>
  (shipment.rates ?? []).map((r) => ({
    id: r.object_id,
    provider: r.provider,
    service: r.servicelevel?.name ?? r.servicelevel?.token ?? "",
    token: r.servicelevel?.token ?? "",
    amount: r.amount,
    currency: r.currency,
    days: r.estimated_days === null || r.estimated_days === undefined ? null : Math.max(1, r.estimated_days),
  }));

/** Up to three rates, cheapest first: the cheapest, the cheapest USPS Priority Mail (not Express), the fastest (cheaper on a tie). Each once. */
export function pickRates(rates) {
  const ok = rates.filter((r) => r.currency === "USD" && Number(r.amount) > 0);
  const price = (r) => Math.round(Number(r.amount) * 100);
  const byPrice = (a, b) => price(a) - price(b) || (a.days ?? 99) - (b.days ?? 99);
  const cheapest = [...ok].sort(byPrice)[0];
  const priority = ok.filter((r) => /^usps_priority/.test(r.token) && !/express/.test(r.token)).sort(byPrice)[0];
  const fastest = ok.filter((r) => r.days !== null && r.days !== undefined).sort((a, b) => a.days - b.days || byPrice(a, b))[0];
  const seen = new Set();
  return [cheapest, priority, fastest].filter((r) => r && !seen.has(r.id) && seen.add(r.id)).sort(byPrice);
}

const rateLabel = (r) => (new RegExp(`^${r.provider}\\b`, "i").test(r.service) ? r.service : `${r.provider} ${r.service}`.trim());
const publicRate = (r) => ({ id: r.id, label: r.label ?? rateLabel(r), cents: r.cents ?? Math.round(Number(r.amount) * 100), minDays: r.days ?? null, maxDays: r.days ?? null, carrier: r.provider });

/** The shipment Shippo prices (and a label is bought from). */
export function shipmentBody({ settings, to, parcel: p, metadata }) {
  const f = settings.shipFrom;
  return {
    address_from: { name: f.name, street1: f.street1, street2: f.street2 || undefined, city: f.city, state: f.state, zip: f.zip, country: "US", phone: f.phone || undefined, email: f.email || undefined },
    address_to: { name: to.name, street1: to.line1, street2: to.line2 || undefined, city: to.city, state: to.state, zip: to.postal_code, country: "US", phone: to.phone || undefined, email: to.email || undefined },
    parcels: [{ length: String(p.lengthIn), width: String(p.widthIn), height: String(p.heightIn), distance_unit: "in", weight: String(p.weightOz), mass_unit: "oz" }],
    metadata,
  };
}

export function createShipping({ config, db, store, notifier, stripeMode, makeShippo = (token) => createShippo({ token }), now = () => Date.now() }) {
  const iso = (ms = now()) => new Date(ms).toISOString();

  /** "test" while Stripe is in test mode, else "live" (also with no Stripe: Bitcoin Cash / pickup sales are real). */
  const mode = () => (stripeMode() === "test" ? "test" : "live");
  const keyFor = (m) => {
    const key = m === "test" ? config.shippoTestKey : config.shippoLiveKey;
    return shippoKeyMode(key) === m ? key : null;
  };
  /** Which key and mode Settings should say is in use. */
  const keyInfo = () => {
    const m = mode();
    return { mode: m, connected: Boolean(keyFor(m)) };
  };
  const shippoFor = (m) => {
    const key = keyFor(m);
    return key ? makeShippo(key) : null;
  };

  /** Live prices apply now: switched on, shipping on, this mode's key there, ship-from complete. */
  function liveNow(settings = store.getSettings()) {
    return Boolean(settings.liveShipping && settings.shipping && keyFor(mode()) && shipFromReady(settings.shipFrom));
  }

  /** What a quote is tied to: mode, address (ignoring case/spacing) and the priced cart. */
  function quoteKey(m, a, items) {
    const lines = items.map((i) => [i.id, i.qty, i.priceCents, i.weightOz ?? null, i.box ?? null]).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
    return sha256(JSON.stringify([m, norm(a.line1), norm(a.line2), norm(a.city), norm(a.state), norm(a.postal_code), lines]));
  }

  const addressErrors = (message) => ({ [/zip|postal/i.test(message) ? "postal_code" : /state/i.test(message) ? "state" : /city/i.test(message) ? "city" : "line1"]: message });

  /** POST /api/shipping-rates: up to three live rates for this cart and address, held ~30 minutes. */
  async function quote({ lines, customer = {}, address }) {
    const s = store.getSettings();
    if (!liveNow(s)) throw new ShopError("Live shipping prices aren't available right now.", { status: 409 });
    const items = store.priceLines(lines, { ship: true });
    const to = readAddress(address);
    const m = mode();
    const parcel = parcelFor(s, items);
    let shipment;
    try {
      shipment = await shippoFor(m).createShipment(shipmentBody({ settings: s, to: { ...to, name: clip(customer.name, 80) || "Customer", phone: clip(customer.phone, 40), email: clip(customer.email, 120) }, parcel, metadata: "garage-sale checkout quote" }));
    } catch (e) {
      if (e.status === 400) throw new ShopError("Please check your shipping address.", { status: 422, errors: addressErrors(e.message) });
      throw new ShopError("Couldn't get shipping prices right now. Please try again in a moment.", { status: 502 });
    }
    const picked = pickRates(ratesOf(shipment));
    if (!picked.length) {
      const why = (shipment.messages ?? []).map((x) => x.text).filter(Boolean).join(" ");
      throw new ShopError(`No shipping options came back for that address. Please check it and try again.${why ? ` (${why})` : ""}`, { status: 422, errors: { line1: "Check the address." } });
    }
    const rates = picked.map((r) => ({ ...r, cents: Math.round(Number(r.amount) * 100), label: rateLabel(r) }));
    const id = randomBytes(18).toString("base64url");
    const expiresAt = iso(now() + QUOTE_MINUTES * 60_000);
    db.prepare("delete from shipping_quotes where expires_at < ?").run(iso(now() - 86_400_000));
    db.prepare("insert into shipping_quotes (id, mode, fingerprint, data, created_at, expires_at) values (?, ?, ?, ?, ?, ?)").run(
      id, m, quoteKey(m, to, items), JSON.stringify({ shipmentId: shipment.object_id, parcel, rates }), iso(), expiresAt,
    );
    return { quoteId: id, rates: rates.map(publicRate), expiresAt };
  }

  /**
   * Checkout with live shipping: the rate the buyer chose, if the quote still fits this cart, address and mode.
   * Returns what placeOrder needs: { shippingOverrideCents, shipTo, label }.
   */
  function choose({ lines, address, quoteId, rateId }) {
    const pick = (msg, errors = { rate: msg }) => new ShopError(msg, { status: 409, errors });
    if (!quoteId || !rateId) throw pick("Choose a shipping option.");
    const items = store.priceLines(lines, { ship: true });
    const to = readAddress(address);
    const q = db.prepare("select * from shipping_quotes where id = ?").get(String(quoteId));
    if (!q) throw pick("Choose a shipping option.");
    if (q.expires_at < iso()) throw pick("Those shipping prices have expired, please choose again.");
    const m = mode();
    if (q.mode !== m || q.fingerprint !== quoteKey(m, to, items)) throw pick("Shipping options changed, please choose again.");
    const data = JSON.parse(q.data);
    const rate = data.rates.find((r) => r.id === rateId);
    if (!rate) throw pick("Choose a shipping option.");
    return {
      shippingOverrideCents: rate.cents,
      shipTo: to,
      // auto: buy this label once the order is paid.
      label: { state: "rates", auto: true, mode: m, shipmentId: data.shipmentId, rates: [rate], parcel: data.parcel },
    };
  }

  // --- Express (Apple Pay / Google Pay) ------------------------------------------------------
  // The wallet's sheet shares only a PARTIAL address until the shopper approves, so prices are quoted for that (with a stand-in
  // street), and the order is made once the full address is known.

  /** What an express quote is tied to: mode and the priced cart (the ZIP and state are checked by expressFits). */
  const expressKey = (m, items) => sha256(JSON.stringify(["express", m, items.map((i) => [i.id, i.qty, i.priceCents, i.weightOz ?? null, i.box ?? null]).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)))]));

  /** POST /api/express/rates: up to three live rates for a partial address, held ~30 minutes. */
  async function expressQuote({ lines, address, coupon }) {
    const s = store.getSettings();
    if (!liveNow(s)) throw new ShopError("Live shipping prices aren't available right now.", { status: 409 });
    const items = store.priceLines(lines, { ship: true });
    const a = readPartialAddress(address);
    const subtotalCents = items.reduce((n, i) => n + i.priceCents * i.qty, 0);
    const discountCents = expressDiscount(coupon, subtotalCents);
    const m = mode();
    const parcel = parcelFor(s, items);
    let shipment;
    try {
      // Shippo wants a street to price a parcel; the real one comes with the full address, once the shopper approves.
      const to = { name: "Express checkout", line1: "Address given at payment", city: a.city || a.state || a.postal_code, state: a.state, postal_code: a.postal_code };
      shipment = await shippoFor(m).createShipment(shipmentBody({ settings: s, to, parcel, metadata: "garage-sale express checkout quote (partial address)" }));
    } catch (e) {
      if (e.status === 400) throw new ShopError("Please check your shipping address.", { status: 422, errors: addressErrors(e.message) });
      throw new ShopError("Couldn't get shipping prices right now. Please try again in a moment.", { status: 502 });
    }
    const picked = pickRates(ratesOf(shipment));
    if (!picked.length) throw new ShopError("No shipping options came back for that address. Please check it and try again.", { status: 422, errors: { postal_code: "Check the address." } });
    const rates = picked.map((r) => ({ ...r, cents: Math.round(Number(r.amount) * 100), label: rateLabel(r) }));
    const id = randomBytes(18).toString("base64url");
    const expiresAt = iso(now() + QUOTE_MINUTES * 60_000);
    db.prepare("delete from shipping_quotes where expires_at < ?").run(iso(now() - 86_400_000));
    db.prepare("insert into shipping_quotes (id, mode, fingerprint, data, created_at, expires_at) values (?, ?, ?, ?, ?, ?)").run(
      id, m, expressKey(m, items), JSON.stringify({ express: true, postal: zip5(a.postal_code), state: a.state || null, shipmentId: shipment.object_id, parcel, rates }), iso(), expiresAt,
    );
    return { quoteId: id, expiresAt, subtotalCents, discountCents, rates: rates.map((r) => ({ ...publicRate(r), totalCents: subtotalCents - discountCents + r.cents })) };
  }

  /** What a typed code takes off, for express: a code that isn't valid is a 409 on errors.coupon. */
  function expressDiscount(raw, subtotalCents) {
    const typed = typeof raw === "string" ? raw.trim() : "";
    if (!typed) return 0;
    const c = findCoupon(store.getSettings(), typed);
    if (!c) throw new ShopError("That code isn't valid.", { status: 409, errors: { coupon: "That code isn't valid." } });
    return discountFor(c, subtotalCents);
  }

  /** The express rate the shopper chose, if its quote still fits this cart, mode and ZIP/state. Returns { rate, data, items }. */
  function expressChoose({ lines, address, quoteId, rateId }) {
    const pick = (msg) => new ShopError(msg, { status: 409, errors: { rate: msg } });
    if (!quoteId || !rateId) throw pick("Choose a shipping option.");
    const items = store.priceLines(lines, { ship: true });
    const q = db.prepare("select * from shipping_quotes where id = ?").get(String(quoteId));
    if (!q) throw pick("Choose a shipping option.");
    if (q.expires_at < iso()) throw pick("Those shipping prices have expired, please choose again.");
    const m = mode();
    const data = JSON.parse(q.data);
    const sameState = !data.state || !address.state || norm(data.state) === norm(address.state);
    if (!data.express || q.mode !== m || q.fingerprint !== expressKey(m, items) || zip5(address.postal_code) !== data.postal || !sameState) throw pick("Shipping options changed, please choose again.");
    const rate = data.rates.find((r) => r.id === rateId);
    if (!rate) throw pick("Choose a shipping option.");
    return { rate, data, items };
  }

  /**
   * The label for an express order is prepared with the FULL street: a new Shippo shipment, and the same service the shopper
   * chose (the quoted one only knew the ZIP). It's still the quoted price the shopper paid. Returns the label JSON (auto-buy on
   * paid) and an optional note; if Shippo can't do it now, label is null and the owner uses Get rates once it's paid.
   */
  async function prepareExpressLabel({ to, customer, parcel, rate }) {
    const s = store.getSettings();
    const m = mode();
    try {
      const shipment = await shippoFor(m).createShipment(shipmentBody({ settings: s, to: { ...to, name: customer.name, phone: customer.phone, email: customer.email }, parcel, metadata: "garage-sale express checkout" }));
      const same = ratesOf(shipment).filter((r) => r.token === rate.token && r.currency === "USD").sort((a, b) => Number(a.amount) - Number(b.amount))[0];
      if (!same) throw new Error(`${rate.label} isn't offered for the full address`);
      const chosen = { ...same, cents: Math.round(Number(same.amount) * 100), label: rateLabel(same) };
      const note = chosen.cents !== rate.cents ? `The label costs $${(chosen.cents / 100).toFixed(2)} for the full address; the buyer paid $${(rate.cents / 100).toFixed(2)}.` : null;
      return { label: { state: "rates", auto: true, mode: m, shipmentId: shipment.object_id, rates: [chosen], parcel }, note };
    } catch (e) {
      return { label: null, note: `The label couldn't be prepared with the full address (${e.message}). Use Get rates once it's paid.` };
    }
  }

  // --- Labels ---------------------------------------------------------------------------------

  const labelOf = (o) => o.label ?? { state: "none" };
  const setLabel = (id, label, extra = {}) => store.setOrderFields(id, { label, ...extra });
  const note = (o, text) => store.setOrderFields(o.id, { notes: `${store.getOrder(o.id).notes}\n${text}`.trim() });
  const orderMode = (o) => o.label?.mode ?? mode();

  /** Writes a visible problem on the order and tells the owner. Never throws. */
  async function problem(id, message) {
    try {
      const o = store.setOrderFields(id, { problem: message });
      await notifier.problem?.(o, message);
    } catch (e) {
      console.error(`[shipping] problem note: ${e.message}`);
    }
  }

  /** Owner: price a label for a paid shipping order (new shipment from the order's own details). */
  async function getRates(id, parcelInput = {}) {
    const o = store.getOrder(id) ?? fail("Order not found.", 404);
    if (o.fulfillment !== "ship") throw new ShopError("This order isn't shipping.", { status: 409 });
    if (!["paid", "completed"].includes(o.status)) throw new ShopError("Labels are for paid orders.", { status: 409 });
    if (o.shippedAt) throw new ShopError("This order has already shipped.", { status: 409 });
    const label = labelOf(o);
    if (["buying", "uncertain", "bought"].includes(label.state)) throw new ShopError(label.state === "bought" ? "A label was already bought." : "A label purchase is in progress: use Check label.", { status: 409 });
    const m = orderMode(o);
    const shippo = shippoFor(m);
    if (!shippo) throw new ShopError(`Add the Shippo ${m} key (${m === "test" ? "SHIPPO_TEST_KEY" : "SHIPPO_API_KEY"}) to the server's .env to buy labels here.`, { status: 409 });
    const s = store.getSettings();
    if (!shipFromReady(s.shipFrom)) throw new ShopError("Add your ship-from address (with phone and email) in Settings first.", { status: 409 });
    if (!o.shipTo?.line1) throw new ShopError("This order has no shipping address.", { status: 409 });
    const base = parcelFor(s, o.items.map((i) => ({ qty: i.qty, weightOz: i.weightOz ?? null, box: i.box ?? null })));
    const p = { ...base, ...Object.fromEntries(Object.entries(parcelInput ?? {}).filter(([k, v]) => k in base && Number(v) > 0).map(([k, v]) => [k, Number(v)])) };
    let shipment;
    try {
      shipment = await shippo.createShipment(shipmentBody({ settings: s, to: { ...o.shipTo, name: o.customer.name || "Customer", phone: o.customer.phone, email: o.customer.email }, parcel: p, metadata: `garage-sale order #${o.number}` }));
    } catch (e) {
      throw new ShopError(`Shippo couldn't price it: ${e.message}`, { status: 502 });
    }
    const rates = ratesOf(shipment).sort((a, b) => Number(a.amount) - Number(b.amount)).map((r) => ({ ...r, cents: Math.round(Number(r.amount) * 100), label: rateLabel(r) }));
    const messages = (shipment.messages ?? []).map((x) => x.text).filter(Boolean);
    setLabel(id, { state: "rates", mode: m, shipmentId: shipment.object_id, rates, parcel: p, messages, auto: false });
    if (!rates.length) throw new ShopError(`No rates came back${messages.length ? `: ${messages.join(" ")}` : ". Check the address and package."}`, { status: 422 });
    return store.getOrder(id);
  }

  /** Buys the label for a rate shown on the order. Does not mark shipped. */
  async function buyLabel(id, rateId, { emailBuyer = true } = {}) {
    const o = store.getOrder(id) ?? fail("Order not found.", 404);
    if (!["paid", "completed"].includes(o.status)) throw new ShopError("Labels are for paid orders.", { status: 409 });
    const label = labelOf(o);
    if (label.state !== "rates") throw new ShopError(label.state === "bought" ? "A label was already bought." : label.state === "none" ? "Get rates first." : "A label purchase is in progress: use Check label.", { status: 409 });
    const rate = label.rates.find((r) => r.id === rateId);
    if (!rate) throw new ShopError("Choose one of the rates shown.", { status: 409 });
    const shippo = shippoFor(orderMode(o));
    if (!shippo) throw new ShopError("The Shippo key for this mode isn't set.", { status: 409 });
    setLabel(id, { ...label, state: "buying", rateId, chosen: rate });
    let tx;
    try {
      tx = await shippo.buyLabel(rateId, `garage-sale order #${o.number}`);
    } catch (e) {
      if (e.lost) {
        setLabel(id, { ...label, state: "uncertain", rateId, chosen: rate });
        await problem(id, "Shippo didn't answer when buying the label. Use Check label before buying another.");
        throw new ShopError("Shippo didn't answer. Use Check label before buying another.", { status: 502 });
      }
      setLabel(id, { ...label, state: "rates", error: e.message });
      throw new ShopError(`Shippo couldn't make the label: ${e.message}`, { status: 502 });
    }
    return adopt(id, tx, rate, { emailBuyer });
  }

  async function adopt(id, tx, rate, { emailBuyer }) {
    const o = store.getOrder(id);
    const label = labelOf(o);
    if (tx.status !== "SUCCESS") {
      const msg = (tx.messages ?? []).map((x) => x.text).filter(Boolean).join(" ");
      const pending = ["QUEUED", "WAITING"].includes(tx.status);
      setLabel(id, { ...label, state: pending ? "uncertain" : "rates", error: msg || tx.status });
      throw new ShopError(pending ? "Shippo is still making the label: use Check label in a minute." : `Shippo couldn't make the label${msg ? `: ${msg}` : ""}.`, { status: 502 });
    }
    const chosen = rate ?? label.chosen;
    setLabel(id, { ...label, state: "bought", transactionId: tx.object_id, labelUrl: tx.label_url, chosen, test: tx.test ?? orderMode(o) === "test", boughtAt: iso(), error: null }, {
      trackingCarrier: chosen?.provider ?? null,
      trackingNumber: tx.tracking_number || null,
      trackingUrl: tx.tracking_url_provider || trackingUrl(chosen?.provider, tx.tracking_number) || null,
      problem: null,
    });
    note(o, `Label bought: ${chosen?.label ?? ""}, $${(Number(chosen?.amount ?? 0)).toFixed(2)}${tx.test ? " (test label)" : ""}.`);
    const done = store.getOrder(id);
    // The tracking number goes to the buyer now; the order isn't shipped until the owner says so.
    if (emailBuyer && done.trackingNumber) await notifier.tracking?.(done);
    return done;
  }

  /** Never throws. A failure is written on the order; Get rates / Buy label by hand still work. */
  async function autoBuy(id) {
    try {
      const o = store.getOrder(id);
      const label = o ? labelOf(o) : null;
      if (!label?.auto || label.state !== "rates" || label.autoTried || !["paid", "completed"].includes(o.status) || o.shippedAt) return;
      setLabel(id, { ...label, autoTried: true });
      await buyLabel(id, label.rates[0].id);
    } catch (e) {
      const state = labelOf(store.getOrder(id)).state;
      await problem(id, state === "uncertain" ? "Buying the label automatically didn't get an answer from Shippo. Use Check label before buying another." : `The label couldn't be bought automatically (${e.message}). Use Get rates to buy it yourself.`);
    }
  }

  // A separate queue, so a slow Shippo never holds up the payment path.
  let chain = Promise.resolve();
  function onPaid(order) {
    if (!order.label?.auto) return;
    chain = chain.then(() => autoBuy(order.id)).catch(() => {});
  }
  store.setPaidHook(onPaid);

  /** A label purchase whose answer was lost: ask Shippo whether one exists for that rate. */
  async function checkLabel(id) {
    const o = store.getOrder(id) ?? fail("Order not found.", 404);
    const label = labelOf(o);
    if (!["uncertain", "buying"].includes(label.state)) throw new ShopError("Nothing to check.", { status: 409 });
    const found = await shippoFor(orderMode(o)).labelsForRate(label.rateId);
    const tx = (found.results ?? []).find((t) => t.status === "SUCCESS") ?? (found.results ?? []).find((t) => ["QUEUED", "WAITING"].includes(t.status));
    if (tx) return adopt(id, tx, label.chosen, { emailBuyer: true });
    setLabel(id, { ...label, state: "rates" }, { problem: null });
    note(o, "Shippo has no label for that rate, so none was bought. You can buy one now.");
    return store.getOrder(id);
  }

  /** Owner: the parcel is on its way. Records it and sends the buyer the shipped email. Optional typed carrier/tracking replace the label's. */
  async function markShipped(id, { carrier, trackingNumber } = {}) {
    const o = store.getOrder(id) ?? fail("Order not found.", 404);
    if (!["paid", "completed"].includes(o.status)) throw new ShopError("Only paid orders can be marked shipped.", { status: 409 });
    if (o.fulfillment !== "ship") throw new ShopError("This order is for pickup.", { status: 409 });
    if (o.shippedAt) throw new ShopError("This order is already marked shipped.", { status: 409 });
    const c = clip(carrier, 20).toLowerCase();
    const n = clip(trackingNumber, 40).replace(/\s/g, "");
    store.setOrderFields(id, { shippedAt: iso(), ...(c || n ? { trackingCarrier: c || o.trackingCarrier, trackingNumber: n || o.trackingNumber, trackingUrl: c && n ? trackingUrl(c, n) : null } : {}) });
    const done = store.getOrder(id);
    await notifier.shipped?.(done);
    return done;
  }

  const idle = () => chain;
  return { mode, keyInfo, liveNow, quote, choose, expressQuote, expressChoose, prepareExpressLabel, getRates, buyLabel, autoBuy, checkLabel, markShipped, onPaid, idle };
}

function fail(message, status) {
  throw new ShopError(message, { status });
}
