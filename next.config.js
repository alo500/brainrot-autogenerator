/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.r2.dev" },
      { protocol: "https", hostname: "*.klingai.com" },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ["child_process"],
  },
};

module.exports = nextConfig;
