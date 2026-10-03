import type { Metadata, Viewport } from "next";
import { ScreenTransition } from "@/components/sell/ScreenTransition";
import { SellNav } from "@/components/sell/SellNav";
import { SignIn } from "@/components/sell/SignIn";
import { hasPassword, isSignedIn } from "@/lib/auth";
import { hasShop } from "@/lib/shop";

export const metadata: Metadata = {
  title: { default: "Sell", template: "%s · Sell" },
  manifest: "/sell/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Sell", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#2b4c6f" };

export default async function SellLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSignedIn())) return <SignIn ready={hasPassword()} />;
  return (
    <div className="min-h-dvh bg-paper pb-[calc(5rem+env(safe-area-inset-bottom))] print:bg-white print:pb-0">
      {!hasShop && (
        <div className="bg-sun px-4 py-2 text-center text-sm font-bold">The Mac mini isn&apos;t connected yet (SHOP_API_URL), so nothing can be saved. See docs/MAC_MINI.md.</div>
      )}
      <ScreenTransition>{children}</ScreenTransition>
      <SellNav />
    </div>
  );
}
