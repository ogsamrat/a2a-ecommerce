import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  serverExternalPackages: [
    "algosdk",
    "@x402-avm/core",
    "@x402-avm/avm",
    "@x402-avm/fetch",
  ],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        "@web3auth/modal": false,
        "@web3auth/single-factor-auth": false,
        "@web3auth/base": false,
        "@web3auth/base-provider": false,
      };
    }
    return config;
  },
};

export default nextConfig;
