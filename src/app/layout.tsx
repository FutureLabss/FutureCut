import type { Metadata } from "next";
import { LutPresetsSvg } from "@/components/properties/LutPresetsSvg";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "FutureCut — Modern Video Editor",
  description:
    "Browser-based video editor with AI tools, WebCodecs preview, and ffmpeg export.",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.ico",
    apple: "/icon-192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased dark"
      suppressHydrationWarning
    >
      <body
        className="h-screen flex flex-col bg-[var(--bg-app)] text-[var(--text-primary)]"
        suppressHydrationWarning
      >
        <Providers>
          {children}
        </Providers>
        <LutPresetsSvg />
      </body>
    </html>
  );
}

