import { SettingsForm } from "@/components/sell/SettingsForm";
import { bch, hasBch } from "@/lib/bch";
import { hasDatabase } from "@/lib/db";
import { readSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/site";
import { hasStripe, stripeTestMode } from "@/lib/stripe";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await readSettings();
  return (
    <SettingsForm
      initial={settings}
      setup={{
        database: hasDatabase,
        stripe: hasStripe() ? (stripeTestMode() ? "test" : "live") : null,
        stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
        bch: hasBch(),
        bchFirstAddress: hasBch() ? bch().firstAddress() : null,
        walletConnect: Boolean(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID),
        email: Boolean(process.env.RESEND_API_KEY),
        cron: Boolean(process.env.CRON_SECRET),
        siteUrl: siteUrl(),
      }}
    />
  );
}
