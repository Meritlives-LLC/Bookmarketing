/** @type {import('next').NextConfig} */
const nextConfig = {
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
    return [];
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