import { Analytics } from "@vercel/analytics/next";
import { ViewTransition } from "react";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { RevealObserver } from "@/components/motion/RevealObserver";
import { availability } from "@/lib/availability";
import { getCatalog, getSettings, isSample } from "@/lib/shop";
import { CATEGORIES } from "@/lib/site";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const [settings, items] = await Promise.all([getSettings(), getCatalog()]);
  const forSale = items.filter((i) => availability(i) !== "sold");
  const categories = CATEGORIES.map((c) => ({ value: c.value, label: c.label, count: forSale.filter((i) => i.category === c.value).length })).filter((c) => c.count);
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">
        Skip to content
      </a>
      {isSample && <div className="bg-sun px-4 py-1.5 text-center text-xs font-semibold text-ink">Preview: showing sample items until the Mac mini is connected (see docs/MAC_MINI.md).</div>}
      {settings.announcement && <div className="bg-amber px-4 py-2 text-center text-sm font-semibold text-tag-dark">{settings.announcement}</div>}
      <Header name={settings.name} categories={categories} />
      <ViewTransition default="none" update="page">
        <main id="main">{children}</main>
      </ViewTransition>
      <Footer settings={settings} />
      <CartDrawer />
      <RevealObserver />
      <Analytics />
    </>
  );
}
