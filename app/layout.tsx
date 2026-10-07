import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Finanzas",
  description: "Registro de finanzas personales conectado a Google Sheets",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Finanzas",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b1f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased bg-[#0b0b1f]`}>
      <body className="min-h-full flex flex-col bg-[#0b0b1f] text-white">{children}</body>
    </html>
  );
}
