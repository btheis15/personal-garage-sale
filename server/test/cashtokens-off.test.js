// CashTokens off (the default): even with a hot wallet key in .env, no wallet receipts and no "Spread the word",
// and Bitcoin Cash payments still go through, with the receipt by email.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { deriveHdPath, deriveHdPrivateNodeFromSeed, deriveHdPublicNode, encodeHdPublicKey, hexToBin } from "@bitauth/libauth";
import { createBch } from "../src/bch.js";
import { createBchPrices } from "../src/bch-engine/bch.js";
import { newWalletKey } from "../src/bch-engine/hot-wallet.js";
import { createBchChain } from "./bch-chain.js";
import { createFakeBchPrices } from "./bch-fakes.js";
import { jpeg, startServer, uploadPhoto } from "./helpers.js";

const account = deriveHdPath(deriveHdPrivateNodeFromSeed(hexToBin("000102030405060708090a0b0c0d0e0f")), "m/44'/145'/0'");
const XPUB = encodeHdPublicKey({ node: deriveHdPublicNode(account), network: "mainnet" }).hdPublicKey;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let t, chain;
before(async () => {
  chain = createBchChain();
  const warn = console.warn;
  console.warn = () => {};
  t = await startServer({
    bch: (store, db, { partners, sanctions, notifier }) =>
      createBch({
        config: { bchXpub: XPUB, bchHotWalletWif: newWalletKey(), siteUrl: "https://shop.test" },
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
  console.warn = warn;
});
after(() => t.close());

test("no wallet receipts or Spread the word while CashTokens are off", async () => {
  await t.admin("PUT", "/api/admin/settings", { partners: { enabled: true, ratePercent: 10 } });
  const { payments } = (await t.site("GET", "/api/catalog")).body;
  assert.equal(payments.bch, true);
  assert.equal(payments.bchReceipts, false);
  assert.equal(payments.partners, null);
  assert.equal((await t.site("POST", "/api/partners/signup", {})).status, 503);
  const status = (await t.admin("GET", "/api/admin/status")).body;
  assert.equal(status.cashTokens, false);
  assert.equal(status.hotWallet, false);
  const made = await t.admin("POST", "/api/admin/receipts", {});
  assert.equal(made.status, 409);
  assert.match(made.body.error, /BCH_CASHTOKENS/);
});

test("a Bitcoin Cash payment still goes through, and the buyer gets the email receipt", async () => {
  const { body } = await uploadPhoto(t, await jpeg());
  const item = (await t.admin("POST", "/api/admin/items", { title: "Lamp", priceCents: 2000, photos: [body.photo] })).body.item;
  // Asking for a wallet receipt anyway: it falls back to email.
  const r = await t.site("POST", "/api/checkout", { lines: [{ id: item.id, qty: 1 }], customer: { name: "Sam", email: "sam@example.com" }, method: "bch", receipt: "token" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const id = r.body.url.split("/").pop();
  const view = (await t.site("POST", `/api/orders/${id}/bch/start`)).body;
  assert.equal(view.state, "waiting");
  chain.pay(view.address, { sats: view.amountSats ?? 5_000_000 });
  await sleep(50);
  assert.equal((await t.site("GET", `/api/orders/${id}`)).body.order.status, "paid");
  const number = t.store.getOrder(id).number;
  assert.deepEqual(t.sent.find((s) => s[1] === number), ["paid", number, false], "the buyer's email isn't skipped");
});
