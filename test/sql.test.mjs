// The database functions in supabase/migrations, run against PGlite (Postgres in WebAssembly):
// holding items for a checkout, never selling the last one twice, paying, expiring, and the
// Bitcoin Cash address claims.  npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const MIGRATION = readFileSync(new URL("../supabase/migrations/0001_init.sql", import.meta.url), "utf8");

async function freshDb() {
  const db = new PGlite();
  // What Supabase provides that the migration refers to.
  await db.exec(`
    create role anon; create role authenticated;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  `);
  await db.exec(MIGRATION);
  return db;
}

async function addItem(db, { title = "Lamp", price = 2500, quantity = 1, ships = false, shipping = null } = {}) {
  const { rows } = await db.query(
    `insert into items (slug, title, price_cents, quantity, ships, shipping_cents, photos) values ($1, $2, $3, $4, $5, $6, '[{"path":"a.jpg"}]') returning id`,
    [`${title.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`, title, price, quantity, ships, shipping],
  );
  return rows[0].id;
}

const place = (db, lines, { status = "pending", method = "stripe", fulfillment = "pickup", hold = 35, defaultShipping = 0 } = {}) =>
  db.query(`select * from place_order($1::jsonb, $2, $3, 'web', $4, '{"name":"Ann"}'::jsonb, $5, $6)`, [JSON.stringify(lines), status, method, fulfillment, hold, defaultShipping]).then((r) => r.rows[0]);

const item = (db, id) => db.query(`select * from items where id = $1`, [id]).then((r) => r.rows[0]);
const order = (db, id) => db.query(`select * from orders where id = $1`, [id]).then((r) => r.rows[0]);

test("placing an order holds the item, with the prices from the database", async () => {
  const db = await freshDb();
  const a = await addItem(db, { title: "Chair", price: 8500 });
  const b = await addItem(db, { title: "Lamp", price: 2500, quantity: 3 });
  const o = await place(db, [{ id: a, qty: 1 }, { id: b, qty: 2 }]);
  assert.equal(o.status, "pending");
  assert.equal(o.subtotal_cents, 8500 + 2 * 2500);
  assert.equal(o.total_cents, 13500);
  assert.equal(Number(o.number), 1001);
  assert.equal(o.items.length, 2);
  assert.equal(o.items[0].photo, "a.jpg");
  assert.equal((await item(db, a)).quantity, 0);
  assert.ok((await item(db, a)).held_until, "the last one shows On hold");
  assert.equal((await item(db, b)).quantity, 1);
  assert.equal((await item(db, b)).held_until, null, "some still left: not on hold");
});

test("the last one can't be sold twice", async () => {
  const db = await freshDb();
  const a = await addItem(db);
  await place(db, [{ id: a, qty: 1 }]);
  await assert.rejects(place(db, [{ id: a, qty: 1 }]), new RegExp(`unavailable:${a}`));
  const b = await addItem(db, { quantity: 2 });
  await assert.rejects(place(db, [{ id: b, qty: 3 }]), /unavailable/);
});

test("a failed order changes nothing (all or nothing)", async () => {
  const db = await freshDb();
  const a = await addItem(db, { title: "Free one" });
  const b = await addItem(db, { title: "Taken" });
  await place(db, [{ id: b, qty: 1 }]);
  await assert.rejects(place(db, [{ id: a, qty: 1 }, { id: b, qty: 1 }]), /unavailable/);
  assert.equal((await item(db, a)).quantity, 1, "the first item went back when the second failed");
  assert.equal((await db.query("select count(*)::int as n from orders")).rows[0].n, 1);
});

test("shipping: pickup-only items refuse it, and one charge per order (the highest)", async () => {
  const db = await freshDb();
  const pickupOnly = await addItem(db);
  await assert.rejects(place(db, [{ id: pickupOnly, qty: 1 }], { fulfillment: "ship" }), /noship/);
  const a = await addItem(db, { ships: true, shipping: 1500 });
  const b = await addItem(db, { ships: true });
  const o = await place(db, [{ id: a, qty: 1 }, { id: b, qty: 1 }], { fulfillment: "ship", defaultShipping: 2000 });
  assert.equal(o.shipping_cents, 2000);
  assert.equal(o.total_cents, 2500 * 2 + 2000);
});

test("paying marks the order paid once and the item sold", async () => {
  const db = await freshDb();
  const a = await addItem(db);
  const o = await place(db, [{ id: a, qty: 1 }]);
  const first = (await db.query(`select * from mark_order_paid($1, 'stripe', 'pi_123')`, [o.id])).rows[0];
  assert.equal(first.status, "paid");
  assert.equal(first.stripe_payment_intent, "pi_123");
  const second = (await db.query(`select * from mark_order_paid($1, 'stripe', null)`, [o.id])).rows[0];
  assert.equal(second.id, null, "already paid: nothing comes back, so emails go out once");
  const it = await item(db, a);
  assert.equal(it.status, "sold");
  assert.equal(it.sold_via, "stripe");
  assert.equal(it.held_until, null);
});

test("items with more left stay for sale after a paid order", async () => {
  const db = await freshDb();
  const a = await addItem(db, { quantity: 5 });
  const o = await place(db, [{ id: a, qty: 2 }]);
  await db.query(`select * from mark_order_paid($1, 'cash', null)`, [o.id]);
  const it = await item(db, a);
  assert.equal(it.status, "live");
  assert.equal(it.quantity, 3);
});

test("cancelling gives the items back; a paid order can't be released", async () => {
  const db = await freshDb();
  const a = await addItem(db);
  const o = await place(db, [{ id: a, qty: 1 }]);
  assert.equal((await db.query(`select release_order($1, 'cancelled') as ok`, [o.id])).rows[0].ok, true);
  assert.equal((await item(db, a)).quantity, 1);
  assert.equal((await item(db, a)).held_until, null);
  assert.equal((await order(db, o.id)).status, "cancelled");
  assert.equal((await db.query(`select release_order($1, 'cancelled') as ok`, [o.id])).rows[0].ok, false, "twice: nothing more");
  assert.equal((await item(db, a)).quantity, 1, "not given back twice");

  const o2 = await place(db, [{ id: a, qty: 1 }]);
  await db.query(`select * from mark_order_paid($1, 'bch', null)`, [o2.id]);
  assert.equal((await db.query(`select release_order($1, 'cancelled') as ok`, [o2.id])).rows[0].ok, false);
  assert.equal((await item(db, a)).status, "sold");
});

test("holds that ran out are given back by the next checkout", async () => {
  const db = await freshDb();
  const a = await addItem(db);
  const old = await place(db, [{ id: a, qty: 1 }]);
  await db.query(`update orders set hold_until = now() - interval '1 minute' where id = $1`, [old.id]);
  const fresh = await place(db, [{ id: a, qty: 1 }]);
  assert.equal((await order(db, old.id)).status, "expired");
  assert.equal((await order(db, fresh.id)).status, "pending");
  assert.equal((await item(db, a)).quantity, 0);
});

test("pay at pickup holds for hours, and in-person cash orders have no hold left once paid", async () => {
  const db = await freshDb();
  const a = await addItem(db);
  const o = await place(db, [{ id: a, qty: 1 }], { status: "reserved", method: null, hold: 48 * 60 });
  assert.equal(o.status, "reserved");
  const hours = (Date.parse(o.hold_until) - Date.now()) / 3_600_000;
  assert.ok(hours > 47.9 && hours < 48.1);
  const paid = (await db.query(`select * from mark_order_paid($1, 'venmo', null)`, [o.id])).rows[0];
  assert.equal(paid.method, "venmo");
  assert.equal(paid.hold_until, null);
});

test("a payment after the hold ran out takes the items again and leaves a note", async () => {
  const db = await freshDb();
  const a = await addItem(db);
  const o = await place(db, [{ id: a, qty: 1 }], { method: "bch" });
  await db.query(`select release_order($1, 'expired')`, [o.id]);
  assert.equal((await item(db, a)).quantity, 1);
  const paid = (await db.query(`select * from mark_order_paid($1, 'bch', null)`, [o.id])).rows[0];
  assert.equal(paid.status, "paid");
  assert.match(paid.notes, /hold ran out/);
  const it = await item(db, a);
  assert.equal(it.quantity, 0);
  assert.equal(it.status, "sold");
});

test("Bitcoin Cash: new addresses are numbered in order, and freed ones are reused after the wait", async () => {
  const db = await freshDb();
  const i0 = (await db.query(`select bch_claim_new_index('w1', 'o1', now()) as i`)).rows[0].i;
  const i1 = (await db.query(`select bch_claim_new_index('w1', 'o2', now()) as i`)).rows[0].i;
  const other = (await db.query(`select bch_claim_new_index('w2', 'o3', now()) as i`)).rows[0].i;
  assert.deepEqual([i0, i1, other], [0, 1, 0]);
  await db.query(`update bch_addresses set address = 'a' || index, scripthash = 's' || index where wallet = 'w1'`);

  // Nothing free yet.
  assert.equal((await db.query(`select * from bch_claim_free_address('w1', 'o4', now(), now())`)).rows.length, 0);
  // o1 closed a day ago with nothing paid; reuse after 7 days only.
  await db.query(`update bch_addresses set state = 'free', released_at = now() - interval '1 day' where order_id = 'o1'`);
  assert.equal((await db.query(`select * from bch_claim_free_address('w1', 'o4', now() - interval '7 days', now())`)).rows.length, 0);
  const got = (await db.query(`select * from bch_claim_free_address('w1', 'o4', now(), now())`)).rows[0];
  assert.equal(got.index, 0);
  assert.equal(got.order_id, "o4");
  assert.equal(got.previous_order_id, "o1");
  assert.equal(got.state, "reserved");
  assert.equal((await db.query(`select state from bch_addresses where wallet = 'w1' and index = 0`)).rows[0].state, "reserved");
});

test("the public (anon) role can't call the functions", async () => {
  const db = await freshDb();
  const { rows } = await db.query(`select has_function_privilege('anon', 'place_order(jsonb, text, text, text, text, jsonb, integer, integer)', 'execute') as ok`);
  assert.equal(rows[0].ok, false);
});
