import type { NextConfig } from "next";

const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
  : null;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseOrigin ? [{
      protocol: supabaseOrigin.protocol === "http:" ? "http" : "https",
      hostname: supabaseOrigin.hostname,
      port: supabaseOrigin.port,
      pathname: "/storage/v1/object/sign/avatars/**",
    }] : [],
  },
};

export default nextConfig;
