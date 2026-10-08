/**
 * Starts the garage sale's server on the Mac mini (HOST:PORT, put online by Caddy at PUBLIC_URL):
 * the catalog and photos for the website, checkout (Stripe and Bitcoin Cash), and the Sell app's API.
 */
import { createApp } from "./app.js";
import { createBch, createSanctionsList } from "./bch.js";
import { assertProductionReady, loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { createNotifier } from "./notify.js";
import { createPartners } from "./partners.js";
import { createRevalidator } from "./revalidate.js";
import { createStore } from "./store.js";
import { createStripe } from "./stripe.js";

const config = loadConfig();
assertProductionReady(config);
const db = openDb(config.dbFile);
const revalidator = createRevalidator(config);
const store = createStore(db, { onChange: () => revalidator.schedule() });
const notifier = createNotifier({ config, store });
const stripe = createStripe({ config, store, notifier });
// The US sanctions list (partners' payout addresses), and "Spread the word".
const sanctions = createSanctionsList(db);
const partners = createPartners({ db, store, config, isBlocked: sanctions.isBlocked });
const bch = createBch({ config, db, store, notifier, partners, sanctions });
const sanctionsTimer = setInterval(() => sanctions.refresh().catch(() => {}), 3_600_000);
if (bch.enabled && bch.hotWallet) sanctions.refresh().catch(() => {});

// Holds that ran out go back on sale even when nobody is checking out.
const expiry = setInterval(() => store.expireStale(), 60_000);
if (bch.enabled) bch.run();

const server = createApp({ config, store, stripe, bch, notifier, revalidator, partners, sanctions }).listen(config.port, config.host, () => {
  console.log(`[garage-sale] listening on http://${config.host}:${config.port}`);
  if (bch.enabled) console.log(`[garage-sale] Hot wallet (receipts as CashTokens, partners' commissions): ${bch.hotWallet ? "on" : "off (BCH_HOT_WALLET_WIF)"}`);
  console.log(`[garage-sale] Stripe: ${stripe.enabled ? (stripe.testMode ? "test mode" : "live") : "off (STRIPE_SECRET_KEY)"} · Bitcoin Cash: ${bch.enabled ? `on, first address ${bch.firstAddress()}` : "off (BCH_XPUB)"} · emails: ${notifier.enabled ? "on" : "off (SMTP_USER/SMTP_PASS)"}`);
});
server.on("error", (e) => {
  console.error(e.code === "EADDRINUSE" ? `[garage-sale] Port ${config.port} is already in use. Pick another PORT in .env.` : e);
  process.exit(1);
});

function shutdown() {
  clearInterval(expiry);
  clearInterval(sanctionsTimer);
  revalidator.stop();
  if (bch.enabled) bch.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
