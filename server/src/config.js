/**
 * Settings come from the gitignored .env file next to package.json
 * (see .env.example for what each one does).
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env"), quiet: true });

const env = process.env;
const int = (v, d) => (v === undefined || v === "" ? d : Number.parseInt(v, 10));
const url = (v) => (v || "").trim().replace(/\/$/, "");

export function loadConfig(overrides = {}) {
  const dataDir = path.resolve(ROOT, overrides.dataDir ?? env.DATA_DIR ?? "data");
  const config = {
    dataDir,
    dbFile: path.join(dataDir, "garage.db"),
    mediaDir: path.join(dataDir, "media"),
    originalsDir: path.join(dataDir, "originals"),
    host: env.HOST || "127.0.0.1",
    port: int(env.PORT, 8797),
    // The website reads the catalog and starts checkouts with this one.
    siteToken: env.SHOP_API_TOKEN || "",
    // The Sell app (on the website) changes items and orders with this one. Different from the site token.
    adminToken: env.SHOP_ADMIN_TOKEN || "",
    siteUrl: url(env.SITE_URL),
    // This server's own public address (Caddy + DuckDNS), where Stripe sends its notices.
    publicUrl: url(env.PUBLIC_URL),
    revalidateSecret: env.REVALIDATE_SECRET || "",
    stripeSecretKey: (env.STRIPE_SECRET_KEY || "").trim(),
    stripeWebhookSecret: (env.STRIPE_WEBHOOK_SECRET || "").trim(),
    bchXpub: (env.BCH_XPUB || "").trim(),
    smtp: {
      host: env.SMTP_HOST || "smtp.gmail.com",
      port: int(env.SMTP_PORT, 465),
      user: env.SMTP_USER || "",
      pass: (env.SMTP_PASS || "").replace(/\s+/g, ""),
      from: env.MAIL_FROM || env.SMTP_USER || "",
    },
    notifyEmail: env.NOTIFY_EMAIL || env.SMTP_USER || "",
    timeZone: env.TIME_ZONE || "America/Chicago",
    maxImageMb: int(env.MAX_IMAGE_MB, 25),
    backupDir: env.BACKUP_DIR || "",
    ...overrides,
  };
  mkdirSync(config.mediaDir, { recursive: true });
  mkdirSync(config.originalsDir, { recursive: true });
  return config;
}

/** Stops the server from starting with settings that would leave it open or broken. */
export function assertProductionReady(config) {
  const problems = [];
  if (config.siteToken.length < 32) problems.push("SHOP_API_TOKEN must be a random value of 32+ characters (npm run setup-env makes one).");
  if (config.adminToken.length < 32) problems.push("SHOP_ADMIN_TOKEN must be a random value of 32+ characters (npm run setup-env makes one).");
  if (config.adminToken && config.adminToken === config.siteToken) problems.push("SHOP_ADMIN_TOKEN must be different from SHOP_API_TOKEN.");
  if (config.siteUrl && !/^https?:\/\//.test(config.siteUrl)) problems.push("SITE_URL must start with https://");
  if (config.publicUrl && !/^https:\/\//.test(config.publicUrl)) problems.push("PUBLIC_URL must start with https://");
  if (problems.length) {
    console.error(`\nCannot start. Fix these in ${path.join(ROOT, ".env")}:\n - ${problems.join("\n - ")}\n`);
    process.exit(1);
  }
}
