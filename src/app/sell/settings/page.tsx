import { SettingsForm } from "@/components/sell/SettingsForm";
import { hasShop, shopApi } from "@/lib/shop";
import { DEFAULT_SETTINGS, siteUrl } from "@/lib/site";
import type { SiteSettings } from "@/lib/types";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

type Status = {
  stripe: "test" | "live" | null;
  stripeWebhook: boolean;
  bch: boolean;
  bchFirstAddress: string | null;
  email: boolean;
  publicUrl: string | null;
  website: { state: string; message: string };
};

export default async function SettingsPage() {
  const [settings, status] = hasShop
    ? await Promise.all([
        shopApi<{ settings: SiteSettings }>("/api/admin/settings", { admin: true }).then((r) => r.settings),
        shopApi<Status>("/api/admin/status", { admin: true }).catch(() => null),
      ])
    : [DEFAULT_SETTINGS, null];
  return (
    <SettingsForm
      initial={settings}
      setup={{
        server: Boolean(status),
        stripe: status?.stripe ?? null,
        stripeWebhook: Boolean(status?.stripeWebhook),
        bch: Boolean(status?.bch),
        bchFirstAddress: status?.bchFirstAddress ?? null,
        walletConnect: Boolean(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID),
        email: Boolean(status?.email),
        publicUrl: status?.publicUrl ?? null,
        website: status?.website ?? null,
        siteUrl: siteUrl(),
      }}
    />
  );
}
