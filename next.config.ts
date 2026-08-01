import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Same-origin proxy for Supabase: browsers on networks that block
      // *.supabase.co fall back to this path (lib/supabase/client.ts).
      {
        source: '/sb-api/:path*',
        destination: `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://qejyeetwurhszyirhpxd.supabase.co'}/:path*`,
      },
    ]
  },
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
