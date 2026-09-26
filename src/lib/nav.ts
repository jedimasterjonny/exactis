import type { LucideIcon } from "lucide-react";
import type { Route } from "next";

import { History, LayoutDashboard, ListTree, Wallet } from "lucide-react";

import { toRoman } from "@/lib/roman";

// A screen as the navigation lists it and its header names it: where
// it is, its icon and its label in the navigation, and the title its
// header opens with, which the screen and the header standing in for
// it while the store answers both read, so the two cannot drift. The
// dashboard's title is completed with the age the plan runs to.
export interface Screen {
  readonly href: Route;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly title: string;
}

export const dashboard: Screen = {
  href: "/",
  icon: LayoutDashboard,
  label: "Dashboard",
  title: "Projected to age",
};

export const accountsAndAssets: Screen = {
  href: "/accounts",
  icon: Wallet,
  label: "Accounts & assets",
  title: "Accounts & assets",
};

export const plan: Screen = {
  href: "/plan",
  icon: ListTree,
  label: "Plan",
  title: "Income & expenses",
};

export const progress: Screen = {
  href: "/progress",
  icon: History,
  label: "Progress",
  title: "Progress points",
};

// The screens in navigation order. Section numerals derive from this order,
// so inserting a screen renumbers every header after it and nothing else
// has to change. Only built screens appear, since a typed route cannot
// point at one that does not exist.
export const screens: readonly Screen[] = [
  dashboard,
  accountsAndAssets,
  plan,
  progress,
];

// The screen at a pathname, or undefined where no built screen is.
export function screenAt(pathname: string): Screen | undefined {
  return screens.find((screen) => screen.href === pathname);
}

// The label every screen header opens with, "Sect. II · Progress".
export function sectionLabel(screen: Screen): string {
  return `Sect. ${sectionNumeral(screen)} · ${screen.label}`;
}

// The screen's numeral alone, as the navigation shows it beside the label.
export function sectionNumeral(screen: Screen): string {
  return toRoman(screens.indexOf(screen) + 1);
}

// The label a card within a screen opens with, "Sect. III.ii": the
// screen's numeral and the card's own in lower case, counted from one in
// the order the cards are read down the screen.
export function subsectionLabel(screen: Screen, place: number): string {
  return `Sect. ${sectionNumeral(screen)}.${toRoman(place).toLowerCase()}`;
}
