import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "sharp"],
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: [
    "*.e2b.app",
    "*.arena.ai",
    "*.arena.app",
    "localhost:3000",
  ],
  experimental: {
    proxyTimeout: 120_000,
  },
  async headers() {
    return [
      {
        source: "/media/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
