/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  async rewrites() {
    const apiUrl = process.env.NEXUS_API_URL || "http://localhost:8000";
    return [
      { source: "/api/nexus/:path*", destination: `${apiUrl}/api/:path*` },
      { source: "/api/events/stream", destination: `${apiUrl}/api/events/stream` },
    ];
  },
};

module.exports = nextConfig;
