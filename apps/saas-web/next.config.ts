import type { NextConfig } from "next";

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
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: '*.s3.amazonaws.com',
      },
    ],
  },
};

export default nextConfig;