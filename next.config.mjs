/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow importing JSON files
  experimental: {
    serverComponentsExternalPackages: ["@libsql/client"],
  },
};

export default nextConfig;
