/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Enables instrumentation.js (dev-only scheduler poller) on Next 14.
    instrumentationHook: true,
    // Keep nodemailer (which uses node built-ins) out of the bundle.
    serverComponentsExternalPackages: ['nodemailer'],
  },
};

export default nextConfig;
