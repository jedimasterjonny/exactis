import type { Metadata, Viewport } from "next";
import type { JSX } from "react";

import "./globals.css";
import { cn } from "cn";
import { ThemeProvider } from "next-themes";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";

import { Toaster } from "@/components/kit/toast";

// Space Grotesk for headings only, Geist for body and UI text and the
// figure a screen opens on, Geist Mono for every other figure. next/font
// downloads each face at build time and serves it from the app, so
// nothing is fetched from Google at runtime.
const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

// Each screen is titled by its label in the navigation and then the
// app's name, so the title read out on a move between screens says
// where it went; a page that gives no title is titled by the name alone.
export const metadata: Metadata = {
  title: { default: "exactis", template: "%s · exactis" },
};

// The page is drawn to the screen's edges, under a notch and the home
// indicator, rather than letterboxed inside them, so the phone's tab bar
// can meet the foot of the screen. What would sit under either is
// padded clear of it by the safe-area insets where it is drawn: the tab
// bar, the sidebar's footer and the toasts at the foot, and the page and
// the sidebar at the sides. Next merges this over its own width and
// scale, which stay.
export const viewport: Viewport = { viewportFit: "cover" };

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
      // The theme provider sets the dark class on this element before the
      // first paint, from a script, so the server's markup and the client's
      // are allowed to differ in that one attribute.
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          disableTransitionOnChange
          enableSystem={false}
        >
          <Toaster>{children}</Toaster>
        </ThemeProvider>
      </body>
    </html>
  );
}
