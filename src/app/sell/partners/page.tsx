import { PartnerList, type PartnerRow } from "@/components/sell/PartnerList";
import { hasShop, shopApi } from "@/lib/shop";

export const metadata = { title: "Spread the word" };
export const dynamic = "force-dynamic";

type Data = { partners: PartnerRow[]; on: boolean; hotWallet: boolean; sanctions: { updatedAt?: string | null; count?: number } | null };

export default async function PartnersPage() {
  const data = hasShop ? await shopApi<Data>("/api/admin/partners", { admin: true }).catch(() => null) : null;
  return <PartnerList initial={data?.partners ?? []} on={Boolean(data?.on)} hotWallet={Boolean(data?.hotWallet)} />;
}
