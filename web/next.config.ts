import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ESLint is uit de build-deps gehaald (de transitieve dep unrs-resolver
  // crashte Vercels npm). Next 16 draait standaard geen lint tijdens de build.
};

export default nextConfig;
