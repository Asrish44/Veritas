import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  serverExternalPackages: ["pdf-parse", "@xenova/transformers", "onnxruntime-node"],
};

export default nextConfig;
