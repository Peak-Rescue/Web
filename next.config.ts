import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    minimumCacheTTL: 2678400, // 31 days — replaced images need a new filename/URL
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'qejyeetwurhszyirhpxd.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
