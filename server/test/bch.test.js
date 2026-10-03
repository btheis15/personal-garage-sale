// Bitcoin Cash end to end, against the kit's stand-in network (real BCH transactions built with
// libauth): the order page starts the payment, the buyer pays, and the order turns Paid.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { deriveHdPath, deriveHdPrivateNodeFromSeed, deriveHdPublicNode, encodeHdPublicKey, hexToBin } from "@bitauth/libauth";
import { createBch } from "../src/bch.js";
import { createBchPrices } from "../src/bch-engine/bch.js";
import { addressAt, parseXpub } from "../src/bch-engine/checkout.js";
import { openDb } from "../src/db.js";
import { createBchChain } from "./bch-chain.js";
import { createFakeBchPrices } from "./bch-fakes.js";
import { jpeg, startServer, uploadPhoto } from "./helpers.js";

const account = deriveHdPath(deriveHdPrivateNodeFromSeed(hexToBin("000102030405060708090a0b0c0d0e0f")), "m/44'/145'/0'");
const XPUB = encodeHdPublicKey({ node: deriveHdPublicNode(account), network: "mainnet" }).hdPublicKey;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let t, chain;
before(async () => {
  chain = createBchChain();
  t = await startServer({
    bch: (store, db) => {
      const notifier = { enabled: true, paid: () => {}, reserved: () => {} };
      return createBch({ config: { bchXpub: XPUB }, db, store, notifier, chain, prices: createBchPrices({ fetchImpl: createFakeBchPrices({ usd: 400 }).fetch }), engineOptions: { proofWaitMs: 0 } });
    },
  });
});
after(() => t.close());

test("checkout with Bitcoin Cash: an address in the wallet, paid at zero-conf, the item sold", async () => {
  const { body } = await uploadPhoto(t, await jpeg());
  const item = (await t.admin("POST", "/api/admin/items", { title: "Drill", priceCents: 4000, photos: [body.photo] })).body.item;
  const r = await t.site("POST", "/api/checkout", { lines: [{ id: item.id, qty: 1 }], customer: { name: "Sam", email: "sam@example.com" }, method: "bch" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const id = r.body.url.split("/").pop();

  const view = (await t.site("POST", `/api/orders/${id}/bch/start`)).body;
  assert.equal(view.state, "waiting");
  assert.equal(view.address, addressAt(parseXpub(XPUB), 0).address);
  assert.equal(view.amountBch, "0.1", "$40 at $400");
  // Asking again gives the same payment, not a new one.
  assert.equal((await t.site("POST", `/api/orders/${id}/bch/start`)).body.address, view.address);

  chain.pay(view.address, { sats: 10_000_000 });
  await sleep(50);
  assert.equal((await t.site("GET", `/api/orders/${id}/bch`)).body.state, "paid");
  assert.equal((await t.site("GET", `/api/orders/${id}`)).body.order.status, "paid");
  assert.equal((await t.admin("GET", `/api/admin/items/${item.id}`)).body.item.status, "sold");
  const detail = (await t.admin("GET", `/api/admin/orders/${id}`)).body;
  assert.equal(detail.order.method, "bch");
  assert.ok(detail.bch.events.some((e) => e.kind === "paid"));
});

test("the SQLite store hands out each address once", async () => {
  const db = openDb(":memory:");
  const { createSqliteBchStore } = await import("../src/bch.js");
  const s = createSqliteBchStore(db);
  const derive = (i) => ({ address: `a${i}`, scripthash: `s${i}` });
  assert.equal((await s.claimNewAddress("w", "o1", "2026-01-01", derive)).index, 0);
  assert.equal((await s.claimNewAddress("w", "o2", "2026-01-01", derive)).index, 1);
  assert.equal(await s.claimFreeAddress("w", "o3", "2026-02-01", "2026-02-01"), null);
  await s.releaseAddress("o1", "2026-01-02");
  const free = await s.claimFreeAddress("w", "o3", "2026-02-01", "2026-02-01");
  assert.equal(free.index, 0);
  assert.equal(free.previous.orderId, "o1");
  assert.equal(await s.orderForScripthash("s0"), "o3");
  await s.markAddressUsed("o3");
  assert.equal(await s.unusedAhead("w"), 1);
});
