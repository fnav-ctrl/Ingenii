import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "INGENII+ — Ingeniería y Construcción",
  description: "Ingeniería y Construcción",
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
