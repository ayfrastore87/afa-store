import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.18.37"],
  images: {
    qualities: [75, 100],
  },
};

export default nextConfig;