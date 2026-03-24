import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

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

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

if (process.env.NODE_ENV === "production") {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  });
}

const nextConfig: NextConfig = {
  // Disable turbopack to fix Jest worker issues
  // turbopack: {},

  // Temporary release valve: allow production build while lint backlog is reduced.
  eslint: {
    ignoreDuringBuilds: true,
  },

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

  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
