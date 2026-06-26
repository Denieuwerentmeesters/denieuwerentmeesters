import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ESLint is uit de build-deps gehaald (de transitieve dep unrs-resolver
  // crashte Vercels npm). Next 16 draait standaard geen lint tijdens de build.
  experimental: {
    serverActions: {
      // Verhoogd voor audio-uploads (opnames kunnen 10-20 MB zijn).
      // Vercel staat voor Server Actions tot ~4.5 MB toe op standaard plan,
      // maar grotere bestanden gaan via streaming en mogen tot 25 MB.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
