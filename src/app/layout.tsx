import type { Metadata } from "next";
import type { JSX } from "react";

import "./globals.css";
import { cn } from "cn";
import { GeistSans } from "geist/font/sans";

export const metadata: Metadata = {
  description: "A Next.js skeleton.",
  title: "exactis",
};

export default function RootLayout({
  children,
}: LayoutProps<"/">): JSX.Element {
  return (
    <html className={cn("font-sans", GeistSans.variable)} lang="en">
      <body>{children}</body>
    </html>
  );
}
