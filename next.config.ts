import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["169.254.83.107"],
  async rewrites() {
    return [
      {
        source: "/chat-w-:slug",
        destination: "/public-persona/:slug",
      },
    ];
  },
};

export default nextConfig;
