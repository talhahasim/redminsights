/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Skip static generation for error pages
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
};

export default nextConfig;
