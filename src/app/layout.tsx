import type { Metadata } from "next";
import type { JSX } from "react";

import "./globals.css";
import { cn } from "cn";
import { Geist } from "next/font/google";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  description: "A Next.js skeleton.",
  title: "exactis",
};

export default function RootLayout({
  children,
}: LayoutProps<"/">): JSX.Element {
  return (
    <html className={cn("font-sans", geist.variable)} lang="en">
      <body>{children}</body>
    </html>
  );
}
