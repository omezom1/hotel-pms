/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['react-date-range'],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
