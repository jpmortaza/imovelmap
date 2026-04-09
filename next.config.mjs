/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.olx.com.br" },
      { protocol: "https", hostname: "**.olx.com.br" }
    ]
  }
};

export default nextConfig;
