import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Piazza en Obra — Programa de Beneficios",
  description: "Una comunidad que construye.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
