/**
 * Registers the website's domain (SITE_URL) with Stripe so Apple Pay shows on the checkout page:
 *   npm run apple-pay-domain            (test key: sandbox)
 *   npm run apple-pay-domain -- --live  (only with a live key: it changes the real account)
 * Uses paymentMethodDomains.create (https://docs.stripe.com/api/payment_method_domains/create). Needs a key that may write
 * "Payment method domains". Stripe checks the domain itself; there's no file to host. Safe to run again.
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env"), quiet: true });
const key = (process.env.STRIPE_SECRET_KEY || "").trim();
const site = (process.env.SITE_URL || "").trim();
const live = /^(sk|rk)_live_/.test(key);

if (!/^(sk|rk)_(test|live)_/.test(key)) bail("STRIPE_SECRET_KEY isn't set in server/.env.");
if (!/^https:\/\//.test(site)) bail("SITE_URL in server/.env must be the website's https:// address.");
if (live && !process.argv.includes("--live")) bail("That's a LIVE Stripe key. Run again with --live if you mean it.");

const domain = new URL(site).hostname;
const stripe = new Stripe(key);
try {
  let d;
  try {
    d = await stripe.paymentMethodDomains.create({ domain_name: domain });
  } catch (e) {
    // Already registered: find it instead.
    const found = (await stripe.paymentMethodDomains.list({ domain_name: domain, limit: 1 })).data[0];
    if (!found) throw e;
    d = found;
  }
  console.log(`${live ? "LIVE" : "Test"} mode, domain ${d.domain_name}: enabled=${d.enabled}`);
  console.log(`  Apple Pay:  ${d.apple_pay?.status ?? "unknown"}`);
  console.log(`  Google Pay: ${d.google_pay?.status ?? "unknown"}`);
  if (d.apple_pay?.status !== "active") {
    const v = await stripe.paymentMethodDomains.validate(d.id).catch(() => null);
    if (v) console.log(`  After checking again, Apple Pay: ${v.apple_pay?.status ?? "unknown"}${v.apple_pay?.status_details?.error_message ? ` (${v.apple_pay.status_details.error_message})` : ""}`);
  }
} catch (e) {
  bail(`Stripe said: ${e.message}`);
}

function bail(message) {
  console.error(message);
  process.exit(1);
}
