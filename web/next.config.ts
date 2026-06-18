import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ESLint is uit de build-deps gehaald (de transitieve dep unrs-resolver
  // crashte Vercels npm). Lint draait niet tijdens de build.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
