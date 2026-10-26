import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Next.js 16.4.2 omits parallel catch-all params when predicting sibling routes.
    optimisticRouting: false,
  },
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];

    const apiUrl = (process.env.API_URL || "http://localhost:4000").replace(/\/$/, "");
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
