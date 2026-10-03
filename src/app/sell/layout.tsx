import type { Metadata, Viewport } from "next";
import { SellNav } from "@/components/sell/SellNav";
import { SignIn } from "@/components/sell/SignIn";
import { hasPassword, isSignedIn } from "@/lib/auth";
import { hasDatabase } from "@/lib/db";

export const metadata: Metadata = {
  title: { default: "Sell", template: "%s · Sell" },
  manifest: "/sell/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Sell", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#f26a2e" };

export default async function SellLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSignedIn())) return <SignIn ready={hasPassword()} />;
  return (
    <div className="min-h-dvh bg-paper pb-[calc(5rem+env(safe-area-inset-bottom))]">
      {!hasDatabase && (
        <div className="bg-sun px-4 py-2 text-center text-sm font-bold">Supabase isn&apos;t connected yet, so nothing can be saved. See the README, then Settings → Setup.</div>
      )}
      {children}
      <SellNav />
    </div>
  );
}
