import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { ToastProvider } from "@/components/ToastProvider";

export const metadata: Metadata = {
  title: "INFINITE — an AI-generated visual universe",
  description:
    "A self-generating archive of visual inspiration. Every image is imagined, generated and catalogued by an autonomous AI agent.",
  openGraph: {
    title: "INFINITE — an AI-generated visual universe",
    description: "An infinite atlas of visual ideas, drawn by an agent that never sleeps.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0807",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/fraunces.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen antialiased">
        <div className="ambient" aria-hidden="true" />
        <div className="grain" aria-hidden="true" />
        <ToastProvider>
          <SiteHeader />
          <main className="relative z-10">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
