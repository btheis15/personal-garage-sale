// "Spread the word" and receipts as CashTokens, end to end against the kit's stand-in network: a partner signs up,
// a buyer pays with Bitcoin Cash through their link, and the partner's commission goes out from the hot wallet;
// a receipt is minted from the hot wallet and claimed into the buyer's wallet.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { deriveHdPath, deriveHdPrivateNodeFromSeed, deriveHdPublicNode, encodeHdPublicKey, hexToBin } from "@bitauth/libauth";
import { createBch } from "../src/bch.js";
import { createBchPrices } from "../src/bch-engine/bch.js";
import { newWalletKey } from "../src/bch-engine/hot-wallet.js";
import { createFakeBchChain, createFakeBchPrices, createFakeWallet } from "./bch-fakes.js";
import { jpeg, startServer, uploadPhoto } from "./helpers.js";

const account = deriveHdPath(deriveHdPrivateNodeFromSeed(hexToBin("000102030405060708090a0b0c0d0e0f")), "m/44'/145'/0'");
const XPUB = encodeHdPublicKey({ node: deriveHdPublicNode(account), network: "mainnet" }).hdPublicKey;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dana = createFakeWallet(41);
const listed = createFakeWallet(42);
const buyer = createFakeWallet(43);

// The OFAC list as the Treasury publishes it (a big CSV), with one BCH address on it.
const sdn = `${"x".repeat(12_000)}\n"36000","SOMEONE","individual","Digital Currency Address - BCH ${listed.address};"\n`;
const sanctionsFetch = async () => new Response(sdn, { status: 200 });

const signup = (o = {}) => ({ name: "Dana Neighbor", address: dana.address, country: "US", mailingAddress: "12 Elm St, Springfield, IL", usPerson: "yes", certify: true, agree: true, ...o });

let t, chain;
before(async () => {
  chain = createFakeBchChain();
  const wif = newWalletKey();
  t = await startServer({
    sanctionsFetch,
    bch: (store, db, { partners, sanctions, notifier }) =>
      createBch({
        config: { bchXpub: XPUB, bchHotWalletWif: wif, siteUrl: "https://shop.test" },
        db,
        store,
        notifier,
        chain,
        prices: createBchPrices({ fetchImpl: createFakeBchPrices({ usd: 400 }).fetch }),
        engineOptions: { proofWaitMs: 0 },
        partners,
        sanctions,
      }),
  });
  await t.sanctions.refresh({ force: true });
  // The hot wallet: a little BCH for receipts and commissions.
  const { keyWallet } = await import("../src/bch-engine/bch.js");
  chain.fund(keyWallet(wif).address, { sats: 5_000_000 });
  chain.fund(keyWallet(wif).address, { sats: 5_000_000 });
});
after(() => t.close());

async function newItem(o = {}) {
  const { body } = await uploadPhoto(t, await jpeg());
  return (await t.admin("POST", "/api/admin/items", { title: "Bookshelf", priceCents: 4000, photos: [body.photo], ...o })).body.item;
}

describe("Spread the word", () => {
  test("closed until it's turned on in Settings", async () => {
    const r = await t.site("POST", "/api/partners/signup", signup());
    assert.equal(r.status, 503);
    assert.equal((await t.site("GET", "/api/catalog")).body.payments.partners, null);
    await t.admin("PUT", "/api/admin/settings", { partners: { enabled: true, ratePercent: 10 } });
    assert.deepEqual((await t.site("GET", "/api/catalog")).body.payments.partners, { ratePercent: 10 });
  });

  test("sign-up checks: terms, country, sanctions list", async () => {
    const missing = await t.site("POST", "/api/partners/signup", signup({ agree: false, certify: false, usPerson: null }));
    assert.equal(missing.status, 400);
    const embargoed = await t.site("POST", "/api/partners/signup", signup({ country: "CU" }));
    assert.equal(embargoed.status, 400);
    const blocked = await t.site("POST", "/api/partners/signup", signup({ address: listed.address }));
    assert.equal(blocked.status, 400);
    assert.match(JSON.stringify(blocked.body), /can't pay this address/);
  });

  test("a sale through Dana's link pays her 10% of the items from the hot wallet, once", async () => {
    const r = await t.site("POST", "/api/partners/signup", signup());
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const { code, key, link } = r.body;
    assert.match(code, /^dana-[0-9a-f]{4}$/);
    assert.equal(link, `https://shop.test/?s=${code}`);

    const item = await newItem();
    const co = await t.site("POST", "/api/checkout", { lines: [{ id: item.id, qty: 1 }], customer: { name: "Sam", email: "sam@example.com" }, method: "bch", partner: code });
    assert.equal(co.status, 200, JSON.stringify(co.body));
    const id = co.body.url.split("/").pop();
    const view = (await t.site("POST", `/api/orders/${id}/bch/start`)).body;
    const sent0 = chain.state.broadcasts.length;
    chain.pay(view.address, { sats: 10_000_000 }); // $40 at $400
    await sleep(150);
    assert.equal((await t.site("GET", `/api/orders/${id}`)).body.order.status, "paid");

    const page = (await t.site("POST", "/api/partners/me", { key })).body;
    assert.equal(page.commissions.length, 1);
    assert.equal(page.commissions[0].cents, 400, "10% of the $40 bookshelf");
    assert.equal(page.commissions[0].state, "sent");
    assert.equal(page.totals.paidCents, 400);
    assert.ok(chain.state.broadcasts.length > sent0, "sent from the hot wallet");

    const detail = (await t.admin("GET", `/api/admin/orders/${id}`)).body;
    assert.equal(detail.commission.state, "sent");
    assert.equal(detail.commission.partnerName, "Dana Neighbor");
    assert.equal(detail.commission.yourCents, 3600);
    const list = (await t.admin("GET", "/api/admin/partners")).body;
    assert.equal(list.partners[0].totals.paidCents, 400);
  });

  test("a card sale through the link earns nothing (commissions are Bitcoin Cash only)", async () => {
    const { code } = (await t.admin("GET", "/api/admin/partners")).body.partners[0];
    const item = await newItem({ title: "Desk lamp" });
    const co = await t.site("POST", "/api/checkout", { lines: [{ id: item.id, qty: 1 }], customer: { name: "Al", email: "al@example.com" }, method: "stripe", partner: code });
    assert.equal(co.status, 200);
    const order = t.store.listOrders()[0];
    assert.equal(order.partnerId, null);
  });

  test("a paused partner's link stops earning; a US partner stays under the yearly 1099 amount", async () => {
    const p = (await t.admin("GET", "/api/admin/partners")).body.partners[0];
    await t.admin("PATCH", `/api/admin/partners/${p.id}`, { status: "paused" });
    assert.equal(t.partners.forCode(p.code), null);
    await t.admin("PATCH", `/api/admin/partners/${p.id}`, { status: "active" });
    await t.admin("PUT", "/api/admin/settings", { partners: { taxFormOver: 100 } });
    const forPay = t.partners.forPayment(p.id);
    assert.equal(forPay.maxCents, 9900 - 400, "$99 a year, less the $4 already earned");
  });
});

describe("Receipts as CashTokens", () => {
  test("the collection is made from the hot wallet, then offered at checkout", async () => {
    assert.equal((await t.site("GET", "/api/catalog")).body.payments.bchReceipts, false);
    const made = await t.admin("POST", "/api/admin/receipts", {});
    assert.equal(made.status, 200, JSON.stringify(made.body));
    const st = (await t.admin("GET", "/api/admin/receipts")).body;
    assert.ok(st.receipts.collection, "the collection exists");
    assert.equal((await t.site("GET", "/api/catalog")).body.payments.bchReceipts, true);
  });

  test("the note and contact on new receipts follow Settings", async () => {
    await t.admin("PUT", "/api/admin/settings", { receiptNote: "Enjoy the bike!", contactEmail: "brian@example.com" });
    const { look } = (await t.admin("GET", "/api/admin/receipts")).body.receipts;
    assert.equal(look.note, "Enjoy the bike!");
    assert.equal(look.contact, "brian@example.com");
  });

  test("paid by QR code, the receipt waits to be claimed, then goes into the buyer's wallet", async () => {
    const item = await newItem({ title: "Garden hose" });
    const co = await t.site("POST", "/api/checkout", { lines: [{ id: item.id, qty: 1 }], customer: { name: "Bo", email: "bo@example.com" }, method: "bch", receipt: "token" });
    const id = co.body.url.split("/").pop();
    const view = (await t.site("POST", `/api/orders/${id}/bch/start`)).body;
    chain.pay(view.address, { sats: 10_000_000 });
    await sleep(150);
    const paid = (await t.site("GET", `/api/orders/${id}/bch`)).body;
    assert.equal(paid.state, "paid");
    assert.equal(paid.receipt?.state, "claimable", JSON.stringify(paid.receipt));
    assert.match(paid.receipt.name, /Receipt #\d+/);
    // Chose only the CashToken but it has to be claimed: the receipt email still goes.
    const number = t.store.getOrder(id).number;
    assert.ok(t.sent.some(([k, n, skip]) => k === "paid" && n === number && skip === false));
    const claim = await t.site("POST", `/api/orders/${id}/bch/receipt`, { address: buyer.address });
    assert.equal(claim.status, 200, JSON.stringify(claim.body));
    assert.ok(["sending", "sent"].includes(claim.body.receipt?.state), JSON.stringify(claim.body));
  });
});
