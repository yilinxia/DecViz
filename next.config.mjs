/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/logica_backend',
        destination: 'http://127.0.0.1:8000/api/logica_backend',
      },
    ]
  },
}

export default nextConfig
