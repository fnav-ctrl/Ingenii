/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  async rewrites() {
    // El subdominio del panel de administración sirve directamente /admin.html.
    // beforeFiles: se evalúa ANTES que las rutas del app (incluida la página raíz).
    return {
      beforeFiles: [
        { source: "/", has: [{ type: "host", value: "admin.piazzaenobra.com" }], destination: "/admin.html" },
        { source: "/", has: [{ type: "host", value: "admin.piazzaenobra.com.ar" }], destination: "/admin.html" },
      ],
    };
  },
};

module.exports = nextConfig;
