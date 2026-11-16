const demo = process.env.NEXT_PUBLIC_BRIEFHARBOR_DEMO === 'true'
const apiOrigin = process.env.API_ORIGIN || 'http://127.0.0.1:4000'

export default {
  transpilePackages: ['@briefharbor/contracts'],
  devIndicators: false,
  ...(demo ? {
    output: 'export',
    basePath: process.env.NEXT_PUBLIC_BRIEFHARBOR_BASE_PATH || '',
    trailingSlash: true,
    images: { unoptimized: true },
  } : {
    async rewrites() { return [{ source: '/api/:path*', destination: apiOrigin + '/api/:path*' }] },
    async headers() { return [{ source: '/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] }] },
  }),
}
