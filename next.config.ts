import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A tab left open across a deploy is asking a build that no longer exists
  // for its assets and its server actions: the click does nothing and the
  // save fails, both without saying why. With a deployment id, the client
  // sees the mismatch in the response header and hard-reloads instead.
  // Vercel sets VERCEL_DEPLOYMENT_ID at build; the commit sha is the
  // fallback, and locally there is no id and nothing changes.
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || undefined,

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
  async redirects() {
    return [
      // 'Fall Protection & Rope Access' was one offering until Aug 2026 and
      // has been linked to for years. Rope access is the half people search
      // for by name, and the old page's photo was a rope access shot.
      {
        source: '/services/fall-protection-rope-access',
        destination: '/services/rope-access',
        permanent: true,
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
