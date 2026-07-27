import type { NextConfig } from "next";

// Derive the Supabase storage host at config time so next/image can
// optimize catalog and member photos. The wildcard fallback keeps envless
// builds (CI, clean checkouts) compiling.
const supabaseHost = (() => {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  // Next.js 16 blocks cross-origin requests to dev-only assets by default.
  // Allow tunnels (ngrok) so the app renders when shared publicly in dev.
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok.app"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      ...(supabaseHost
        ? [{ protocol: "https" as const, hostname: supabaseHost }]
        : []),
      // Local supabase in dev.
      { protocol: "http", hostname: "localhost" },
      { protocol: "http", hostname: "127.0.0.1" },
    ],
  },
  experimental: {
    serverActions: {
      // Server Actions default to a 1MB request body, and every photo taken on
      // a phone is 3-8MB - so the admin place form silently rejected every
      // real image. 4MB is the practical ceiling here because Vercel caps a
      // serverless request body at 4.5MB; anything larger has to go through a
      // signed direct-to-Storage upload, which is why member photos already do.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
