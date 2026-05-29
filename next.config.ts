import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  allowedDevOrigins: ["192.168.3.200"],
  turbopack: {
    root: process.cwd(),
  },
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
