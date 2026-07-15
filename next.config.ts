import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16 blocks cross-origin requests to dev-only assets by default.
  // Allow tunnels (ngrok) so the app renders when shared publicly in dev.
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok.app"],
  // The ffmpeg installer resolves its platform binary with a dynamic
  // require - keep it external (runtime node_modules) instead of bundled.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
  // The reel worker shells out to a real ffmpeg binary and draws the
  // watermark with a repo-vendored font; both must ride into the traced
  // serverless bundle for the job/cron routes.
  outputFileTracingIncludes: {
    "/api/jobs/reel": [
      "./node_modules/@ffmpeg-installer/**",
      "./assets/fonts/**",
    ],
    "/api/cron/reels": [
      "./node_modules/@ffmpeg-installer/**",
      "./assets/fonts/**",
    ],
  },
};

export default nextConfig;
