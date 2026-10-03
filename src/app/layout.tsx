import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { getSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/site";
import "./globals.css";

// Mukta, by Ek Type (SIL Open Font License, src/assets/fonts/OFL-Mukta.txt).
const mukta = localFont({
  variable: "--font-mukta",
  display: "swap",
  src: [
    { path: "../assets/fonts/Mukta-Medium.ttf", weight: "400", style: "normal" },
    { path: "../assets/fonts/Mukta-Bold.ttf", weight: "700", style: "normal" },
  ],
});

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
  themeColor: "#fbf8f2",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={mukta.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
