/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Allow optimizer for cover CDNs + Cloudinary; formats for modern browsers
    formats: ["image/avif", "image/webp"],
    deviceSizes: [160, 320, 400, 640, 768, 1024],
    imageSizes: [64, 96, 128, 160, 200, 240, 320, 400],
    minimumCacheTTL: 60 * 60 * 24 * 7, // 7 days — covers change rarely
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
      { protocol: "http", hostname: "books.google.com" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "i.gr-assets.com" },
      { protocol: "https", hostname: "images.gr-assets.com" },
      { protocol: "https", hostname: "**.goodreads.com" },
      // fallback for arbitrary cover hosts
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
  async rewrites() {
    return [];
  },
};

export default nextConfig;
