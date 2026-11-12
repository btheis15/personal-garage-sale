/**
 * Makes the Stripe "payment method configuration" that turns Apple Pay, Google Pay and Link OFF, so Stripe's own page is
 * the card form only while the website shows the wallets above it (Express checkout):
 *   npm run card-only-config
 * Put the line it prints in server/.env (STRIPE_CARD_ONLY_CONFIG), then restart. Test and live keys each need their own.
 * Needs a key that may write "Payment method configurations".
 * https://docs.stripe.com/api/payment_method_configurations/create
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env"), quiet: true });
const key = (process.env.STRIPE_SECRET_KEY || "").trim();
if (!/^(sk|rk)_(test|live)_/.test(key)) {
  console.error("STRIPE_SECRET_KEY isn't set in server/.env.");
  process.exit(1);
}
if (/^(sk|rk)_live_/.test(key) && !process.argv.includes("--live")) {
  console.error("That's a LIVE Stripe key. Run again with --live if you mean it.");
  process.exit(1);
}
const off = { display_preference: { preference: "off" } };
try {
  const cfg = await new Stripe(key).paymentMethodConfigurations.create({ name: "Garage sale: card form only (wallets are on the website)", card: { display_preference: { preference: "on" } }, apple_pay: off, google_pay: off, link: off });
  console.log(`STRIPE_CARD_ONLY_CONFIG=${cfg.id}`);
} catch (e) {
  console.error(`Stripe said: ${e.message}\n(The key may need permission to write "Payment method configurations".)`);
  process.exit(1);
}
