import { Analytics } from "@vercel/analytics/next";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { isSample } from "@/lib/items";
import { getSettings } from "@/lib/settings";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">
        Skip to content
      </a>
      {isSample && (
        <div className="bg-sun px-4 py-1.5 text-center text-xs font-bold text-ink">Preview: showing sample items. Connect Supabase to show your own (see the README).</div>
      )}
      {settings.announcement && <div className="bg-ink px-4 py-2 text-center text-sm font-bold text-paper">{settings.announcement}</div>}
      <Header name={settings.name} />
      <main id="main" className="animate-page-in">
        {children}
      </main>
      <Footer settings={settings} />
      <CartDrawer />
      <Analytics />
    </>
  );
}
