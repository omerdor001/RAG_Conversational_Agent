import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', 'mammoth', 'tiktoken'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}

export default nextConfig
