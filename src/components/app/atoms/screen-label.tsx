"use client";

import type { JSX } from "react";

import { usePathname } from "next/navigation";

import { screenAt, sectionLabel } from "@/lib/nav";

// The current screen's section label, "Sect. II · Accounts & assets", read
// off the pathname, for the phone's bar to carry beside the sidebar's
// trigger while the sidebar and its numerals are off canvas. Nothing
// renders where no built screen is. A client component, since the
// pathname is read on the client.
export function ScreenLabel(): JSX.Element | null {
  const screen = screenAt(usePathname());
  if (screen === undefined) {
    return null;
  }
  return (
    <span className="truncate label text-muted-foreground">
      {sectionLabel(screen)}
    </span>
  );
}
