/** @type {import('next').NextConfig} */
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  // Enables a self-contained `.next/standalone` build (server + only the
  // node_modules it actually needs) so the Docker runtime image doesn't
  // have to ship the full node_modules tree. Has no effect outside `next
  // build`/Docker — `next dev` and Render/Railway's `next start` both
  // ignore it, so this is additive and doesn't change any existing
  // non-Docker deployment path.
  output: "standalone",
  // This repo has a package-lock.json at both the monorepo root and here
  // in frontend/, which makes Next.js infer the monorepo root as the
  // tracing root instead of this directory. That silently nests the
  // standalone server at .next/standalone/frontend/server.js instead of
  // .next/standalone/server.js. Pinning it here keeps the output flat.
  outputFileTracingRoot: __dirname,
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [160, 320, 400, 640, 768, 1024],
    imageSizes: [64, 96, 128, 160, 200, 240, 320, 400],
    minimumCacheTTL: 60 * 60 * 24 * 7,

    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "**.cloudinary.com" },

      { protocol: "https", hostname: "m.media-amazon.com" },
      { protocol: "https", hostname: "images-na.ssl-images-amazon.com" },
      { protocol: "https", hostname: "images-eu.ssl-images-amazon.com" },
      { protocol: "https", hostname: "**.ssl-images-amazon.com" },

      { protocol: "https", hostname: "covers.openlibrary.org" },
      { protocol: "https", hostname: "**.openlibrary.org" },

      { protocol: "https", hostname: "books.google.com" },
      { protocol: "https", hostname: "**.googleusercontent.com" },

      { protocol: "https", hostname: "i.gr-assets.com" },
      { protocol: "https", hostname: "images.gr-assets.com" },
      { protocol: "https", hostname: "**.goodreads.com" },
    ],
  },

  async rewrites() {
    const backend = process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:4001";
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          ...(process.env.NODE_ENV === "production"
            ? [
                {
                  key: "Strict-Transport-Security",
                  value:
                    "max-age=63072000; includeSubDomains; preload",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;