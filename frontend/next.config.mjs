/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Headers for PWA & assetlinks
  async headers() {
    return [
      {
        source: "/.well-known/assetlinks.json",
        headers: [
          {
            key: "Content-Type",
            value: "application/json",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
