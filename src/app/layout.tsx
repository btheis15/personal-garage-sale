import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { getSettings } from "@/lib/shop";
import { siteUrl } from "@/lib/site";
import "./globals.css";

// Fraunces (headings) and Inter (text), both SIL Open Font License (src/assets/fonts/).
const fraunces = localFont({ src: "../assets/fonts/fraunces-latin-wght-normal.woff2", variable: "--font-fraunces", weight: "100 900", display: "swap" });
const inter = localFont({ src: "../assets/fonts/inter-latin-wght-normal.woff2", variable: "--font-inter", weight: "100 900", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: s.name, template: `%s | ${s.name}` },
    description: s.tagline,
    openGraph: { siteName: s.name, type: "website", locale: "en_US" },
    twitter: { card: "summary_large_image" },
  };
}

export const viewport: Viewport = {
  themeColor: "#fbf8f1",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        {/* Lets CSS hide scroll-reveal content only when JS is there to reveal it. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
