import type { NextConfig } from "next";

const supabase = process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL) : null;

const nextConfig: NextConfig = {
  images: {
    // Photos uploaded from the Sell app live in Supabase Storage.
    remotePatterns: supabase ? [{ protocol: "https", hostname: supabase.hostname, pathname: "/storage/v1/object/public/**" }] : [],
  },
  // The Bitcoin Cash engine talks to Fulcrum servers over WebSockets: run it as plain Node.
  serverExternalPackages: ["@electrum-cash/network", "@bitauth/libauth"],
};

export default nextConfig;
