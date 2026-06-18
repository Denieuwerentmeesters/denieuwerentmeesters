import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ESLint is uit de build-deps gehaald (de transitieve dep unrs-resolver
  // crashte Vercels npm). Next 16 draait standaard geen lint tijdens de build.
  experimental: {
    serverActions: {
      // Default is 1 MB; documenten zijn vaak groter. LET OP: Vercels
      // serverless body-cap is ~4,5 MB — bestanden van 4,5-5 MB falen daar
      // alsnog. Echt grote bestanden -> later directe upload naar Storage.
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
