import type { Metadata } from "next";
import type { JSX } from "react";

import "./globals.css";
import { cn } from "cn";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";

import { Toaster } from "@/components/ui/toast";

// Space Grotesk for headings only, Geist for body and UI text, Geist Mono
// for every figure. next/font downloads each face at build time and serves
// it from the app, so nothing is fetched from Google at runtime.
const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  description: "A Next.js skeleton.",
  title: "exactis",
};

export default function RootLayout({
  children,
}: LayoutProps<"/">): JSX.Element {
  return (
    <html
      className={cn(
        "font-sans",
        geistMono.variable,
        geistSans.variable,
        spaceGrotesk.variable,
      )}
      lang="en"
    >
      <body>
        <Toaster>{children}</Toaster>
      </body>
    </html>
  );
}
