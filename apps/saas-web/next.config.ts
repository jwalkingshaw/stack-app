import type { NextConfig } from "next";

const configuredCloudFrontDomain = (process.env.AWS_CLOUDFRONT_DOMAIN || "")
  .trim()
  .replace(/^https?:\/\//i, "")
  .replace(/\/+$/, "");

const remotePatterns: Array<{ protocol: "https"; hostname: string }> = [
  {
    protocol: "https",
    hostname: "*.amazonaws.com",
  },
  {
    protocol: "https",
    hostname: "*.s3.amazonaws.com",
  },
  {
    protocol: "https",
    hostname: "*.cloudfront.net",
  },
];

if (configuredCloudFrontDomain.length > 0) {
  remotePatterns.push({
    protocol: "https",
    hostname: configuredCloudFrontDomain,
  });
}

const nextConfig: NextConfig = {
  // Disable turbopack to fix Jest worker issues
  // turbopack: {},

  // Add experimental settings for better stability
  experimental: {
    // Reduce worker pool size to prevent Jest worker errors
    workerThreads: false,
    cpus: 1,
  },

  // Webpack configuration for better compatibility
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      // Reduce memory usage in development
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            default: {
              minChunks: 1,
              reuseExistingChunk: true,
            },
          },
        },
      };
    }
    return config;
  },

  images: {
    remotePatterns,
  },
};

export default nextConfig;
