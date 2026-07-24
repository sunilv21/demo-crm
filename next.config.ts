import path from 'node:path';
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  // firebase-admin/auth pulls in jwks-rsa -> jose, which is ESM-only; letting
  // the bundler (Turbopack in prod builds too, as of Next 16) inline it into
  // the serverless function produces a broken require() of that ESM file at
  // runtime ("ERR_REQUIRE_ESM"), 500ing every API route that imports
  // firebase-admin. Marking it external skips bundling it — Node's own
  // require resolves it from node_modules at runtime instead, same as it
  // already works in local `next dev`.
  serverExternalPackages: ['firebase-admin'],
  // The voucher .docx generator (src/app/actions/docx-helpers.ts) reads
  // public/sky.png off disk at runtime via fs.readFileSync rather than
  // importing it — Next's serverless file tracing only bundles files it can
  // see referenced through imports, so /public assets read this way are
  // silently left out of the deployed function ("ENOENT ... public/sky.png"
  // in prod, works fine locally where the whole repo is on disk). This
  // forces it to be included in every server bundle.
  outputFileTracingIncludes: {
    '/**': ['./public/sky.png'],
  },
  // Pin the workspace root explicitly. Without this, Turbopack scans upward
  // for lockfiles and can pick the wrong one if an unrelated package-lock.json
  // exists higher up (e.g. an ad-hoc `npm install` run in the user's home
  // directory) — it then resolves modules from the wrong node_modules.
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#root-directory
  turbopack: {
    root: __dirname,
  },
  // Security headers (addresses Lighthouse "Best Practices": clickjacking,
  // origin isolation, MIME sniffing, referrer leakage). A strict CSP /
  // Trusted-Types policy is intentionally omitted — it needs careful allow-
  // listing for Firebase + Google and would break the app if misconfigured.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.pexels.com',
        port: '',
        pathname: '/**',
      }
    ],
  },
};

export default nextConfig;
