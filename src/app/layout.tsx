import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LutPresetsSvg } from "@/components/properties/LutPresetsSvg";
import { Providers } from "@/components/Providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FutureCut — Video Editor",
  description:
    "A browser-based video editor with trim, split, and export. No uploads, everything runs locally.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
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

