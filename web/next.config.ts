import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ESLint is uit de build-deps gehaald (de transitieve dep unrs-resolver
  // crashte Vercels npm). Next 16 draait standaard geen lint tijdens de build.
  experimental: {
    serverActions: {
      // Default is 1 MB; documenten zijn vaak groter. Net onder Vercels
      // serverless body-cap (4,5 MB). Grotere bestanden -> later directe
      // upload naar Storage via signed URL (buiten de server-action om).
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
