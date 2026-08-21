import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  output: "export",
  trailingSlash: true,
  typedRoutes: true,
  images: {
    deviceSizes: [640, 768, 1440],
    loader: "custom",
    loaderFile: "./src/shared/image-loader.ts",
  },
  transpilePackages: ["@velachess/ui"],
  experimental: {
    inlineCss: true,
    swcPlugins: [["@lingui/swc-plugin", {}]],
  },
};

export default nextConfig;
