/**
 * Items, orders and settings. Everything that decides something lives here: prices always come
 * from the database (never from the browser), and checkouts hold items in one transaction.
 */
import { randomUUID } from "node:crypto";
import { CATEGORIES, CHANNELS, CONDITIONS, DEFAULT_SETTINGS, SOLD_SHOWN_DAYS, STATUSES, slugify } from "./site.js";

export class ShopError extends Error {
  constructor(message, { status = 400, itemIds = undefined } = {}) {
    super(message);
    this.status = status;
    this.itemIds = itemIds;
  }
}

const json = (s, fallback) => {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
};

export const mediaUrl = (photo, width = photo.maxWidth) => `/media/${photo.id}/${width}.webp`;

export function toItem(r) {
  if (!r) return null;
  const photos = json(r.photos, []);
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    priceCents: r.price_cents,
    compareAtCents: r.compare_at_cents,
    condition: r.condition,
    category: r.category,
    size: r.size,
    brand: r.brand,
    photos: photos.map((p) => ({ ...p, url: mediaUrl(p) })),
    status: r.status,
    quantity: r.quantity,
    heldUntil: r.held_until,
    obo: Boolean(r.obo),
    pickup: Boolean(r.pickup),
    ships: Boolean(r.ships),
    shippingCents: r.shipping_cents,
    featured: Boolean(r.featured),
    channels: json(r.channels, {}),
    notes: r.notes,
    soldAt: r.sold_at,
    soldVia: r.sold_via,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function toOrder(r) {
  if (!r) return null;
  return {
    id: r.id,
    number: r.number,
    status: r.status,
    method: r.method,
    channel: r.channel,
    items: json(r.items, []),
    subtotalCents: r.subtotal_cents,
    shippingCents: r.shipping_cents,
    totalCents: r.total_cents,
    fulfillment: r.fulfillment,
    customer: json(r.customer, {}),
    stripeSessionId: r.stripe_session_id,
    holdUntil: r.hold_until,
    paidAt: r.paid_at,
    completedAt: r.completed_at,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

const publicItem = ({ notes, ...rest }) => rest;

export const isId = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id ?? ""));

const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const cents = (v) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100_000_000 ? Math.round(n) : null;
};

export function createStore(db, { now = () => Date.now(), onChange = () => {} } = {}) {
  const iso = (ms = now()) => new Date(ms).toISOString();

  // --- Settings ---------------------------------------------------------------------

  function getSettings() {
    const row = db.prepare("select value from settings where key = 'site'").get();
    return { ...DEFAULT_SETTINGS, ...json(row?.value, {}) };
  }

  const LIMITS = { name: 60, tagline: 140, about: 3000, pickupArea: 120, pickupInstructions: 2000, contactEmail: 120, contactPhone: 40, venmo: 60, announcement: 140 };
  function saveSettings(body = {}) {
    const next = getSettings();
    for (const [k, max] of Object.entries(LIMITS)) if (typeof body[k] === "string") next[k] = body[k].trim().slice(0, max);
    if (!next.name) throw new ShopError("The shop needs a name.");
    if (next.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.contactEmail)) throw new ShopError("That email address doesn't look right.");
    for (const k of ["payAtPickup", "shipping"]) if (typeof body[k] === "boolean") next[k] = body[k];
    if (body.payAtPickupHours !== undefined) {
      const h = Math.round(Number(body.payAtPickupHours));
      if (!(h >= 1 && h <= 336)) throw new ShopError("Hold pay-at-pickup items for 1 to 336 hours.");
      next.payAtPickupHours = h;
    }
    if (body.defaultShippingCents !== undefined) {
      const c = Math.round(Number(body.defaultShippingCents));
      if (!(c >= 0 && c <= 100_000)) throw new ShopError("Shipping must be between $0 and $1,000.");
      next.defaultShippingCents = c;
    }
    db.prepare("insert into settings (key, value) values ('site', ?) on conflict(key) do update set value = excluded.value").run(JSON.stringify(next));
    onChange();
    return next;
  }

  // --- Items --------------------------------------------------------------------------

  const getItem = (id) => toItem(db.prepare("select * from items where id = ?").get(id));

  /** Live items, plus what sold in the last two weeks (shown as Sold). */
  function catalog() {
    const since = iso(now() - SOLD_SHOWN_DAYS * 86_400_000);
    return db
      .prepare("select * from items where status = 'live' or (status = 'sold' and sold_at >= ?) order by coalesce(published_at, created_at) desc limit 2000")
      .all(since)
      .map((r) => publicItem(toItem(r)));
  }

  /** One item for the shop by its link (older sold ones too). */
  function itemBySlug(slug) {
    const r = db.prepare("select * from items where slug = ? and status in ('live', 'sold')").get(String(slug));
    return r ? publicItem(toItem(r)) : null;
  }

  function listItems(status) {
    const rows = status && status !== "all" ? db.prepare("select * from items where status = ? order by created_at desc").all(status) : db.prepare("select * from items order by created_at desc").all();
    return rows.map(toItem);
  }

  /** Checks what the Sell app sent. Missing fields fall back to `base` (an edit) or the defaults. */
  function parseItemInput(body, base = null) {
    const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
    const title = has("title") ? text(body.title, 120) : (base?.title ?? "");
    if (!title) throw new ShopError("Give it a title.");
    const priceCents = has("priceCents") ? cents(body.priceCents) : (base?.priceCents ?? null);
    if (priceCents === null) throw new ShopError("Give it a price (0 for free).");
    const condition = has("condition") ? body.condition : (base?.condition ?? "good");
    if (!CONDITIONS.includes(condition)) throw new ShopError("Pick a condition.");
    const status = has("status") ? body.status : (base?.status ?? "live");
    if (!STATUSES.includes(status)) throw new ShopError("Unknown status.");
    const category = has("category") ? (CATEGORIES.includes(body.category) ? body.category : "other") : (base?.category ?? "other");

    let photos = base?.photos.map(({ id, width, height, maxWidth }) => ({ id, width, height, maxWidth })) ?? [];
    if (has("photos")) {
      if (!Array.isArray(body.photos)) throw new ShopError("Photos must be a list.");
      photos = body.photos.slice(0, 12).map((p) => {
        if (!isId(p?.id)) throw new ShopError("A photo isn't valid. Try adding it again.");
        const ok = (n) => Math.max(1, Math.min(10_000, Math.round(Number(n) || 0)));
        return { id: p.id, width: ok(p.width), height: ok(p.height), maxWidth: ok(p.maxWidth || p.width) };
      });
    }
    if (status === "live" && !photos.length) throw new ShopError("Add at least one photo before putting it in the shop (or save it as a draft).");

    let channels = base?.channels ?? {};
    if (has("channels") && body.channels && typeof body.channels === "object") {
      channels = {};
      for (const k of CHANNELS) {
        const c = body.channels[k];
        if (!c || typeof c !== "object") continue;
        const url = text(c.url, 500);
        if (url && !/^https:\/\//i.test(url)) throw new ShopError("Listing links must start with https://");
        channels[k] = { ...(url ? { url } : {}), listedAt: text(c.listedAt, 40) || iso() };
      }
    }

    const quantity = has("quantity") ? Math.max(0, Math.min(999, Math.round(Number(body.quantity)))) : (base?.quantity ?? 1);
    if (!Number.isFinite(quantity)) throw new ShopError("Quantity must be a number.");
    return {
      title,
      description: has("description") ? text(body.description, 5000) : (base?.description ?? ""),
      priceCents,
      compareAtCents: has("compareAtCents") ? cents(body.compareAtCents) : (base?.compareAtCents ?? null),
      condition,
      category,
      size: has("size") ? text(body.size, 40) : (base?.size ?? ""),
      brand: has("brand") ? text(body.brand, 60) : (base?.brand ?? ""),
      photos,
      status,
      quantity,
      obo: has("obo") ? Boolean(body.obo) : (base?.obo ?? false),
      pickup: has("pickup") ? Boolean(body.pickup) : (base?.pickup ?? true),
      ships: has("ships") ? Boolean(body.ships) : (base?.ships ?? false),
      shippingCents: has("shippingCents") ? cents(body.shippingCents) : (base?.shippingCents ?? null),
      featured: has("featured") ? Boolean(body.featured) : (base?.featured ?? false),
      channels,
      notes: has("notes") ? text(body.notes, 2000) : (base?.notes ?? ""),
    };
  }

  function uniqueSlug(title, exceptId = null) {
    const base = slugify(title);
    const taken = new Set(db.prepare("select slug from items where (slug = ? or slug like ?) and id is not ?").all(base, `${base}-%`, exceptId).map((r) => r.slug));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }

  function row(input, base = null) {
    const t = iso();
    const becameSold = input.status === "sold" && base?.status !== "sold";
    // Back for sale after it sold: at least one again.
    const quantity = input.status === "sold" ? 0 : base?.status === "sold" && input.quantity === 0 ? 1 : input.quantity;
    return {
      title: input.title,
      description: input.description,
      price_cents: input.priceCents,
      compare_at_cents: input.compareAtCents && input.compareAtCents > input.priceCents ? input.compareAtCents : null,
      condition: input.condition,
      category: input.category,
      size: input.size,
      brand: input.brand,
      photos: JSON.stringify(input.photos),
      status: input.status,
      quantity,
      held_until: input.status !== "sold" && quantity > 0 ? null : (base?.heldUntil ?? null),
      obo: input.obo ? 1 : 0,
      pickup: input.pickup || !input.ships ? 1 : 0,
      ships: input.ships ? 1 : 0,
      shipping_cents: input.shippingCents,
      featured: input.featured ? 1 : 0,
      channels: JSON.stringify(input.channels),
      notes: input.notes,
      published_at: input.status === "live" ? (base?.publishedAt ?? t) : (base?.publishedAt ?? null),
      sold_at: becameSold ? t : input.status === "sold" ? (base?.soldAt ?? t) : null,
      sold_via: becameSold ? "marked" : input.status === "sold" ? (base?.soldVia ?? null) : null,
      updated_at: t,
    };
  }

  function createItem(body) {
    const input = parseItemInput(body);
    const r = { ...row(input), id: randomUUID(), slug: uniqueSlug(input.title), created_at: iso() };
    const cols = Object.keys(r);
    db.prepare(`insert into items (${cols.join(", ")}) values (${cols.map((c) => `@${c}`).join(", ")})`).run(r);
    onChange();
    return getItem(r.id);
  }

  function updateItem(id, body) {
    const base = getItem(id);
    if (!base) throw new ShopError("That item doesn't exist any more.", { status: 404 });
    const input = parseItemInput(body, base);
    const r = row(input, base);
    // The link keeps working once it's been in the shop; a draft's follows its title.
    if (input.title !== base.title && !base.publishedAt) r.slug = uniqueSlug(input.title, id);
    db.prepare(`update items set ${Object.keys(r).map((c) => `${c} = @${c}`).join(", ")} where id = @id`).run({ ...r, id });
    onChange();
    return getItem(id);
  }

  /** Deletes the item; returns its photos' ids so their files can go too. */
  function deleteItem(id) {
    const item = getItem(id);
    if (!item) return [];
    db.prepare("delete from items where id = ?").run(id);
    onChange();
    return item.photos.map((p) => p.id);
  }

  /** Sold in the last two weeks but listed on another site too: a reminder to mark it sold there. */
  function soldButListedElsewhere() {
    const since = iso(now() - 14 * 86_400_000);
    return listItems("sold")
      .filter((i) => Object.keys(i.channels).length && i.soldAt && i.soldAt >= since)
      .map((i) => i.id);
  }

  // --- Orders -------------------------------------------------------------------------

  const getOrder = (id) => (isId(id) ? toOrder(db.prepare("select * from orders where id = ?").get(id)) : null);
  const orderBySession = (sessionId) => toOrder(db.prepare("select * from orders where stripe_session_id = ?").get(sessionId));

  const releaseTx = db.transaction((id, status) => {
    const o = db.prepare("select * from orders where id = ?").get(id);
    if (!o || !["pending", "reserved"].includes(o.status)) return false;
    for (const line of json(o.items, [])) {
      db.prepare("update items set quantity = quantity + ?, held_until = null, updated_at = ? where id = ? and status = 'live'").run(Math.max(1, line.qty | 0), iso(), line.id);
    }
    db.prepare("update orders set status = ?, updated_at = ? where id = ?").run(status, iso(), id);
    return true;
  });

  /** Puts an unpaid order's items back (cancelled, or its hold ran out). True if it changed. */
  function releaseOrder(id, status = "cancelled") {
    const changed = releaseTx(id, status);
    if (changed) onChange();
    return changed;
  }

  /** Gives back what unpaid orders past their hold were holding. Returns the ids that expired. */
  function expireStale() {
    const ids = db.prepare("select id from orders where status in ('pending', 'reserved') and hold_until is not null and hold_until < ?").all(iso()).map((r) => r.id);
    for (const id of ids) releaseTx(id, "expired");
    if (ids.length) onChange();
    return ids;
  }

  const placeTx = db.transaction(({ lines, status, method, channel, fulfillment, customer, holdMinutes, defaultShippingCents }) => {
    const hold = holdMinutes === null || holdMinutes === undefined ? null : iso(now() + holdMinutes * 60_000);
    const snapshot = [];
    let subtotal = 0;
    let ship = 0;
    for (const line of lines) {
      const qty = Math.max(1, Math.min(99, Math.round(line.qty) || 1));
      const it = db.prepare("select * from items where id = ?").get(line.id);
      if (!it || it.status !== "live" || it.quantity < qty) throw new ShopError("Sorry, something in your cart just sold or is on hold.", { status: 409, itemIds: [line.id] });
      if (fulfillment === "ship" && !it.ships) throw new ShopError("One of the items is pickup only.");
      const left = it.quantity - qty;
      db.prepare("update items set quantity = ?, held_until = ?, updated_at = ? where id = ?").run(left, left === 0 ? hold : it.held_until, iso(), it.id);
      const photo = json(it.photos, [])[0];
      snapshot.push({ id: it.id, slug: it.slug, title: it.title, priceCents: it.price_cents, qty, photo: photo ? mediaUrl(photo, photo.maxWidth > 480 ? 480 : photo.maxWidth) : null });
      subtotal += it.price_cents * qty;
      if (fulfillment === "ship") ship = Math.max(ship, it.shipping_cents ?? defaultShippingCents ?? 0);
    }
    const number = (db.prepare("select max(number) as n from orders").get().n ?? 1000) + 1;
    const t = iso();
    const id = randomUUID();
    db.prepare(
      `insert into orders (id, number, status, method, channel, items, subtotal_cents, shipping_cents, total_cents, fulfillment, customer, hold_until, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, number, status, method, channel, JSON.stringify(snapshot), subtotal, ship, subtotal + ship, fulfillment, JSON.stringify(customer ?? {}), hold, t, t);
    return id;
  });

  /**
   * Creates an order and takes its items out of stock in one go, so two buyers can never get the
   * last one. lines: [{ id, qty }]. Gives back stale holds first.
   */
  function placeOrder({ lines, status = "pending", method = null, channel = "web", fulfillment = "pickup", customer = {}, holdMinutes = null, defaultShippingCents = 0 }) {
    const clean = (Array.isArray(lines) ? lines : []).filter((l) => isId(l?.id)).slice(0, 50);
    if (!clean.length) throw new ShopError("Your cart is empty.");
    expireStale();
    const id = placeTx({ lines: clean, status, method, channel, fulfillment, customer, holdMinutes, defaultShippingCents });
    onChange();
    return getOrder(id);
  }

  const paidTx = db.transaction((id, method, paymentIntent) => {
    const o = db.prepare("select * from orders where id = ?").get(id);
    if (!o || ["paid", "completed"].includes(o.status)) return false;
    let notes = o.notes;
    const lines = json(o.items, []);
    // Paid after it expired or was cancelled: the items went back, so take them out again.
    if (["cancelled", "expired"].includes(o.status)) {
      for (const line of lines) db.prepare("update items set quantity = max(0, quantity - ?), updated_at = ? where id = ?").run(Math.max(1, line.qty | 0), iso(), line.id);
      notes = `${notes}\nPaid after the hold ran out: check the items are still here.`.trim();
    }
    for (const line of lines) {
      db.prepare(
        `update items set
           status = case when quantity = 0 then 'sold' else status end,
           sold_at = case when quantity = 0 then ? else sold_at end,
           sold_via = case when quantity = 0 then ? else sold_via end,
           held_until = null, updated_at = ?
         where id = ?`,
      ).run(iso(), method ?? o.method, iso(), line.id);
    }
    db.prepare(
      `update orders set status = 'paid', method = coalesce(?, method), stripe_payment_intent = coalesce(?, stripe_payment_intent),
         paid_at = ?, hold_until = null, notes = ?, updated_at = ? where id = ?`,
    ).run(method, paymentIntent, iso(), notes, iso(), id);
    return true;
  });

  /** Marks the order paid, once. Returns the order if this call changed it (so emails go out once), else null. */
  function markPaid(id, method = null, paymentIntent = null) {
    if (!paidTx(id, method, paymentIntent)) return null;
    onChange();
    return getOrder(id);
  }

  function completeOrder(id) {
    db.prepare("update orders set status = 'completed', completed_at = ?, updated_at = ? where id = ? and status = 'paid'").run(iso(), iso(), id);
    return getOrder(id);
  }

  function setOrderFields(id, fields) {
    const allowed = { method: "method", stripeSessionId: "stripe_session_id", notes: "notes", customer: "customer" };
    const sets = [];
    const vals = [];
    for (const [k, col] of Object.entries(allowed)) {
      if (!(k in fields)) continue;
      sets.push(`${col} = ?`);
      vals.push(k === "customer" ? JSON.stringify(fields[k] ?? {}) : fields[k]);
    }
    if (!sets.length) return getOrder(id);
    db.prepare(`update orders set ${sets.join(", ")}, updated_at = ? where id = ?`).run(...vals, iso(), id);
    return getOrder(id);
  }

  function listOrders(limit = 300) {
    expireStale();
    return db.prepare("select * from orders order by created_at desc limit ?").all(limit).map(toOrder);
  }

  return {
    getSettings,
    saveSettings,
    getItem,
    catalog,
    itemBySlug,
    listItems,
    parseItemInput,
    createItem,
    updateItem,
    deleteItem,
    soldButListedElsewhere,
    getOrder,
    orderBySession,
    placeOrder,
    releaseOrder,
    expireStale,
    markPaid,
    completeOrder,
    setOrderFields,
    listOrders,
  };
}

/** What the buyer's order page shows (no private notes). */
export function buyerView(o) {
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    method: o.method,
    channel: o.channel,
    items: o.items.map((i) => ({ ...i, photoUrl: i.photo ?? null })),
    subtotalCents: o.subtotalCents,
    shippingCents: o.shippingCents,
    totalCents: o.totalCents,
    fulfillment: o.fulfillment,
    holdUntil: o.holdUntil,
    paidAt: o.paidAt,
    name: o.customer?.name ?? null,
  };
}
