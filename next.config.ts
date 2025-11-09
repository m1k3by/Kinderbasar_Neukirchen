import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for better Cloudflare Pages compatibility
  output: 'standalone',
  
  // Optimize for Edge Runtime where possible
  experimental: {
    // Enable server actions for forms
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  
  // Webpack configuration for Cloudflare compatibility
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude problematic Node.js modules from bundling
      config.externals = config.externals || [];
      config.externals.push({
        'canvas': 'commonjs canvas',
        'jsdom': 'commonjs jsdom',
      });
    }
    return config;
  },
};

export default nextConfig;
