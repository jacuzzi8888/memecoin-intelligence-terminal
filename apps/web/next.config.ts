import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@memecoin/ui", "@memecoin/schemas", "@memecoin/config"],
  experimental: {
    serverComponentsExternalPackages: ["@memecoin/database"],
  },
};

export default nextConfig;
