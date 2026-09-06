import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.18.37"],
  images: {
    qualities: [75, 100],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "jaivvnxpbdiksuqzewdd.supabase.co",
        pathname: "/storage/v1/object/public/products/**",
      },
    ],
  },
};

export default nextConfig;