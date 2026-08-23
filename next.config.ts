import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle so the Docker image ships only what it
  // needs — no node_modules copy, no build toolchain in the runtime layer.
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  poweredByHeader: false,
};

export default nextConfig;
