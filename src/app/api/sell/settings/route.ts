import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { hasBch } from "@/lib/bch";
import { hasDatabase } from "@/lib/db";
import { errorResponse, readJson } from "@/lib/http";
import { readSettings, saveSettings } from "@/lib/settings";
import { hasStripe, stripeTestMode } from "@/lib/stripe";

/** The settings, and what's connected (for the Setup checklist). */
export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  return NextResponse.json({ settings: await readSettings(), setup: setupStatus() });
}

export async function PUT(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ settings: await saveSettings(await readJson(request)), setup: setupStatus() });
  } catch (e) {
    return errorResponse(e);
  }
}

function setupStatus() {
  return {
    database: hasDatabase,
    stripe: hasStripe() ? (stripeTestMode() ? "test" : "live") : null,
    stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    bch: hasBch(),
    walletConnect: Boolean(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID),
    email: Boolean(process.env.RESEND_API_KEY),
    cron: Boolean(process.env.CRON_SECRET),
  };
}
