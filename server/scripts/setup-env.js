/**
 * Creates .env from .env.example (never overwrites), with three fresh random secrets. Copy
 * SHOP_API_TOKEN, SHOP_ADMIN_TOKEN and REVALIDATE_SECRET into Vercel afterwards (it prints how).
 *   npm run setup-env
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../src/config.js";

const dest = path.join(ROOT, ".env");
if (existsSync(dest)) {
  console.error(".env already exists. Edit it directly, or delete it first to start over.");
  process.exit(1);
}
const secret = () => randomBytes(32).toString("base64url");
const values = { SHOP_API_TOKEN: secret(), SHOP_ADMIN_TOKEN: secret(), REVALIDATE_SECRET: secret() };
let text = readFileSync(path.join(ROOT, ".env.example"), "utf8");
for (const [k, v] of Object.entries(values)) text = text.replace(new RegExp(`^${k}=$`, "m"), `${k}=${v}`);
writeFileSync(dest, text, { mode: 0o600 });
console.log("Created .env with new secrets. Add these three to Vercel (Settings → Environment Variables, Production):\n");
for (const [k, v] of Object.entries(values)) console.log(`  ${k}=${v}`);
console.log("\nThen fill in PUBLIC_URL, DUCKDNS_DOMAIN and DUCKDNS_TOKEN in .env (see docs/MAC_MINI.md).");
