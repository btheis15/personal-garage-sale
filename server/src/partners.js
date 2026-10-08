/**
 * "Spread the word": friends, neighbors, anyone can sign up on the website to share the sale, and earns a
 * commission on the Bitcoin Cash sales their link brings, paid at the moment the sale is paid.
 *
 *   sign up     a name, a Bitcoin Cash address, country and mailing address (for the agreement), and agreeing to
 *               the terms. They get their link (<site>/?s=<code>, on any page: the whole sale or one item) and the
 *               key to their own page (<site>/share/me#key=…) at once.
 *   a sale      the website passes the link's code with a Bitcoin Cash checkout; the order remembers the partner.
 *               Prices are always the shop's (nothing about money comes from the link).
 *   the payout  the kit's commissions engine (bch-engine/commissions.js): from a connected wallet the partner's
 *               share is part of the buyer's own transaction; paid any other way, the hot wallet sends it as soon as
 *               the payment counts. Addresses on the US sanctions list are never paid (bch-engine/sanctions.js).
 *   the limit   a US partner earns at most $1 less than the yearly 1099-NEC amount (Settings), so no tax forms are
 *               ever owed; partners abroad aren't limited. No partners in embargoed countries.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { walletAddress } from "./bch-engine/bch.js";
import { EMBARGOED, PARTNER_TERMS_VERSION } from "./site.js";
import { ShopError } from "./store.js";

const hash = (s) => createHash("sha256").update(String(s)).digest("hex");
const clean = (v, max = 200) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const emailOk = (v) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v);
const SIGNUPS_PER_HOUR = 20;

export function createPartners({ db, store, config, now = () => Date.now(), isBlocked = () => false }) {
  const iso = (ms = now()) => new Date(ms).toISOString();
  const cfg = () => store.getSettings().partners;
  const get = (id) => db.prepare("select * from partners where id = ?").get(id);
  const byCode = (code) => (/^[a-z0-9-]{3,40}$/i.test(String(code ?? "")) ? db.prepare("select * from partners where code = ?").get(String(code).toLowerCase()) : null);
  const byKey = (key) => (key && String(key).length >= 20 ? db.prepare("select * from partners where key_hash = ? and status != 'removed'").get(hash(key)) : null);
  const put = (id, patch) => {
    const keys = Object.keys(patch);
    db.prepare(`update partners set ${keys.map((k) => `${k} = @${k}`).join(", ")}, updated_at = @__t where id = @__id`).run({ ...patch, __t: iso(), __id: id });
  };
  const rateOf = (p) => p.rate_percent ?? cfg().ratePercent;
  const linkOf = (p) => `${config.siteUrl}/?s=${p.code}`;
  const pageUrl = (key) => `${config.siteUrl}/share/me#key=${key}`;

  /** A short code for their link from their name: "dana-k7m2". */
  function newCode(name) {
    const base =
      clean(name, 40)
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .split("-")[0]
        .slice(0, 16) || "friend";
    for (;;) {
      const code = `${base}-${randomBytes(3).toString("hex").slice(0, 4)}`;
      if (!byCode(code)) return code;
    }
  }

  function checkAddress(raw) {
    let address;
    try {
      address = walletAddress(raw).address;
    } catch (e) {
      throw new ShopError(`${e.message} Paste the Bitcoin Cash address your commissions should go to.`, { status: 400, errors: { address: e.message } });
    }
    if (isBlocked(address)) throw new ShopError("We can't pay this address.", { status: 400, errors: { address: "We can't pay this address." } });
    return address;
  }

  // --- Signing up ----------------------------------------------------------------------------------

  function signUp(input = {}) {
    if (!cfg().enabled) throw new ShopError("Spread the word isn't open right now.", { status: 503 });
    const errors = {};
    const name = clean(input.name, 60);
    if (name.length < 2) errors.name = "Your name.";
    let address = null;
    try {
      address = checkAddress(input.address);
    } catch (e) {
      errors.address = e.errors?.address ?? e.message;
    }
    const email = clean(input.email, 120).toLowerCase() || null;
    if (email && !emailOk(email)) errors.email = "That doesn't look like an email address (or leave it empty).";
    const country = clean(input.country, 2).toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) errors.country = "Choose the country you live in.";
    else if (EMBARGOED[country]) errors.country = `We can't pay partners in ${EMBARGOED[country]} (US sanctions).`;
    const mailingAddress = String(input.mailingAddress ?? "").replace(/[ \t]+/g, " ").trim().slice(0, 300);
    if (mailingAddress.length < 8) errors.mailingAddress = "Your mailing address (it goes in our agreement with you).";
    const usPerson = input.usPerson === "yes" ? 1 : input.usPerson === "no" ? 0 : null;
    if (usPerson === null) errors.usPerson = "Are you a US citizen or US tax resident?";
    if (input.certify !== true) errors.certify = "Please confirm this.";
    if (input.agree !== true) errors.agree = "Please agree to the terms.";
    if (Object.keys(errors).length) throw new ShopError("Please check the form.", { status: 400, errors });
    const lastHour = db.prepare("select count(*) n from partners where created_at >= ?").get(iso(now() - 3_600_000)).n;
    if (lastHour >= SIGNUPS_PER_HOUR) throw new ShopError("Lots of people are signing up right now. Please try again in an hour.", { status: 429 });
    const key = randomBytes(24).toString("base64url");
    const row = {
      id: randomUUID(),
      code: newCode(name),
      name,
      address,
      email,
      key_hash: hash(key),
      country,
      us_person: usPerson,
      mailing_address: mailingAddress,
      terms_version: PARTNER_TERMS_VERSION,
      terms_accepted_at: iso(),
      created_at: iso(),
      updated_at: iso(),
    };
    db.prepare(
      `insert into partners (id, code, name, address, email, key_hash, country, us_person, mailing_address, terms_version, terms_accepted_at, created_at, updated_at)
       values (@id, @code, @name, @address, @email, @key_hash, @country, @us_person, @mailing_address, @terms_version, @terms_accepted_at, @created_at, @updated_at)`,
    ).run(row);
    return { ...profile(get(row.id)), key, pageUrl: pageUrl(key) };
  }

  // --- The yearly limit for US partners ----------------------------------------------------------------

  const yearStart = () => `${new Date(now()).getUTCFullYear()}-01-01`;
  const earnedThisYear = (p) =>
    db.prepare("select coalesce(sum(cents), 0) n from commissions where partner_id = ? and state != 'cancelled' and created_at >= ?").get(p.id, yearStart()).n;

  /** A US partner earns at most $1 less than the 1099-NEC amount a year; partners abroad aren't limited. */
  function limitOf(p) {
    const over = cfg().taxFormOver;
    const earnedCents = earnedThisYear(p);
    if (!p.us_person || !(over > 0)) return { limitCents: null, leftCents: null, earnedCents };
    const limitCents = Math.max(0, over * 100 - 100);
    return { limitCents, leftCents: Math.max(0, limitCents - earnedCents), earnedCents };
  }

  // --- Their own page ------------------------------------------------------------------------------------

  function mustKey(key) {
    const p = byKey(key);
    if (!p) throw new ShopError("This page link isn't valid any more. Ask us for a new one.", { status: 401 });
    return p;
  }

  function profile(p) {
    return {
      code: p.code,
      name: p.name,
      link: linkOf(p),
      address: p.address,
      email: p.email,
      ratePercent: rateOf(p),
      status: p.status,
      country: p.country,
      usPerson: Boolean(p.us_person),
      termsVersion: p.terms_version,
      termsAcceptedAt: p.terms_accepted_at,
    };
  }

  const commissionView = (c) => ({
    order: c.order_number,
    at: c.created_at,
    ratePercent: c.rate_percent,
    baseCents: c.base_cents,
    cents: c.cents,
    state: c.state,
    how: c.how,
    bch: c.sats ? (c.sats / 1e8).toFixed(8).replace(/\.?0+$/, "") : null,
    txUrl: c.txid ? `https://blockchair.com/bitcoin-cash/transaction/${c.txid}` : null,
    note: c.note,
  });

  function totals(partnerId) {
    const sum = (where, ...a) => db.prepare(`select coalesce(sum(cents), 0) n, count(*) c from commissions where partner_id = ? and ${where}`).get(partnerId, ...a);
    const paid = sum("state = 'sent'");
    const waiting = sum("state = 'pending'");
    return { sales: paid.c + waiting.c, paidCents: paid.n, waitingCents: waiting.n };
  }

  function myPage(key) {
    const p = mustKey(key);
    const limit = limitOf(p);
    return {
      partner: profile(p),
      totals: totals(p.id),
      limit: limit.limitCents === null ? null : { ...limit, reached: limit.leftCents <= 0 },
      commissions: db.prepare("select * from commissions where partner_id = ? order by created_at desc limit 100").all(p.id).map(commissionView),
      open: cfg().enabled,
    };
  }

  function setAddress(key, raw) {
    const p = mustKey(key);
    put(p.id, { address: checkAddress(raw) });
    return myPage(key);
  }

  function setEmail(key, raw) {
    const p = mustKey(key);
    const email = clean(raw, 120).toLowerCase();
    if (email && !emailOk(email)) throw new ShopError("That doesn't look like an email address.", { status: 400, errors: { email: "Enter your email address." } });
    put(p.id, { email: email || null });
    return myPage(key);
  }

  // --- At checkout and after payment ---------------------------------------------------------------------

  /** The partner a link's code names, if it can earn right now (program on, partner active). */
  function forCode(code) {
    if (!cfg().enabled) return null;
    const p = byCode(code);
    return p && p.status === "active" ? p : null;
  }

  /** The partner for the BCH engine's start(): rate, address, and what's left of a US partner's yearly limit. */
  function forPayment(partnerId) {
    if (!partnerId || !cfg().enabled) return null;
    const p = get(partnerId);
    if (!p || p.status !== "active" || isBlocked(p.address)) return null;
    const limit = limitOf(p);
    if (limit.leftCents !== null && limit.leftCents <= 0) return null;
    return { id: p.id, address: p.address, ratePercent: rateOf(p), ...(limit.leftCents !== null ? { maxCents: limit.leftCents } : {}) };
  }

  /** The commission as the engine reports it (pending at payment; sent or cancelled once settled). */
  function record(order, c) {
    if (!order || !c) return;
    const t = iso();
    db.prepare(
      `insert into commissions (order_id, partner_id, order_number, rate_percent, base_cents, cents, state, how, sats, txid, note, created_at, updated_at, sent_at)
       values (@order_id, @partner_id, @order_number, @rate_percent, @base_cents, @cents, @state, @how, @sats, @txid, @note, @t, @t, @sent_at)
       on conflict(order_id) do update set rate_percent = excluded.rate_percent, base_cents = excluded.base_cents, cents = excluded.cents, state = excluded.state,
         how = excluded.how, sats = excluded.sats, txid = excluded.txid, note = excluded.note, updated_at = excluded.updated_at, sent_at = coalesce(excluded.sent_at, commissions.sent_at)`,
    ).run({
      order_id: order.id,
      partner_id: c.partnerId,
      order_number: order.number,
      rate_percent: c.ratePercent ?? null,
      base_cents: c.baseCents ?? null,
      cents: c.cents ?? null,
      state: c.state === "sent" ? "sent" : c.state === "cancelled" ? "cancelled" : "pending",
      how: c.how ?? null,
      sats: c.sats ?? null,
      txid: c.state === "sent" ? (c.txid ?? null) : null,
      note: c.note ?? null,
      t,
      sent_at: c.state === "sent" ? t : null,
    });
  }

  // --- The Sell app --------------------------------------------------------------------------------------

  function list() {
    return db
      .prepare("select * from partners where status != 'removed' order by created_at desc")
      .all()
      .map((p) => ({ id: p.id, ...profile(p), ownRate: p.rate_percent, mailingAddress: p.mailing_address, createdAt: p.created_at, totals: totals(p.id), limit: limitOf(p) }));
  }

  function commissionsFor(partnerId) {
    return db.prepare("select * from commissions where partner_id = ? order by created_at desc limit 200").all(partnerId).map((c) => ({ ...commissionView(c), orderId: c.order_id }));
  }

  /** Pause or remove a partner, or give them their own rate (null: the shop's). */
  function update(id, body = {}) {
    const p = get(id);
    if (!p) throw new ShopError("Not found.", { status: 404 });
    const patch = {};
    if (["active", "paused", "removed"].includes(body.status)) patch.status = body.status;
    if (body.ratePercent === null || body.ratePercent === "") patch.rate_percent = null;
    else if (body.ratePercent !== undefined) {
      const r = Number(body.ratePercent);
      if (!(r >= 1 && r <= 50)) throw new ShopError("A commission rate is between 1% and 50%.");
      patch.rate_percent = Math.round(r * 10) / 10;
    }
    if (Object.keys(patch).length) put(id, patch);
    return list().find((x) => x.id === id) ?? null;
  }

  return { signUp, myPage, setAddress, setEmail, forCode, forPayment, record, list, commissionsFor, update, byId: get };
}
