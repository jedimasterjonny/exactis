import type { LucideIcon } from "lucide-react";
import type { Route } from "next";

import { History, LayoutDashboard, Wallet } from "lucide-react";

import { toRoman } from "@/lib/roman";

export interface Screen {
  readonly href: Route;
  readonly icon: LucideIcon;
  readonly label: string;
}

export const dashboard: Screen = {
  href: "/",
  icon: LayoutDashboard,
  label: "Dashboard",
};

export const accountsAndAssets: Screen = {
  href: "/accounts",
  icon: Wallet,
  label: "Accounts & assets",
};

export const progress: Screen = {
  href: "/progress",
  icon: History,
  label: "Progress",
};

// The screens in navigation order. Section numerals derive from this order,
// so inserting a screen renumbers every header after it and nothing else
// has to change. Only built screens appear, since a typed route cannot
// point at one that does not exist.
export const screens: readonly Screen[] = [
  dashboard,
  accountsAndAssets,
  progress,
];

// The label every screen header opens with, "Sect. II · Progress".
export function sectionLabel(screen: Screen): string {
  return `Sect. ${sectionNumeral(screen)} · ${screen.label}`;
}

// The screen's numeral alone, as the navigation shows it beside the label.
export function sectionNumeral(screen: Screen): string {
  return toRoman(screens.indexOf(screen) + 1);
}
