/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  async rewrites() {
    return [
      // URL limpia para la web de Viso de Campo (archivo estático en /public)
      { source: "/visodecampo", destination: "/visodecampo.html" },
      { source: "/viso-de-campo", destination: "/visodecampo.html" },
    ];
  },
};

module.exports = nextConfig;
