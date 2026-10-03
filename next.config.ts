import type { NextConfig } from "next";

const shopApiUrl = (process.env.SHOP_API_URL ?? "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // Photos live on the Mac mini. Serving them through this site keeps one address and lets
  // Vercel's CDN cache them (they never change: a new photo gets a new id).
  async rewrites() {
    return shopApiUrl ? [{ source: "/media/:path*", destination: `${shopApiUrl}/media/:path*` }] : [];
  },
};

export default nextConfig;
