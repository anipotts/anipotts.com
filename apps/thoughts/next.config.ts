import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@anipotts/ui", "@anipotts/lib", "@anipotts/types"],
  async rewrites() {
    return [
      // PostHog proxy to avoid ad blockers
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
      {
        source: "/ingest/decide",
        destination: "https://us.i.posthog.com/decide",
      },
    ];
  },
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
