import type { LucideIcon } from "lucide-react";
import type { Route } from "next";

import {
  CalendarCheck,
  Cpu,
  Dices,
  History,
  LayoutDashboard,
  ListTree,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";

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

export const chance: Screen = {
  href: "/chance",
  icon: Dices,
  label: "Chance of success",
  title: "Chance of success",
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
  label: "Income & expenses",
  title: "Income & expenses",
};

export const progress: Screen = {
  href: "/progress",
  icon: History,
  label: "Progress",
  title: "Progress points",
};

export const assumptions: Screen = {
  href: "/assumptions",
  icon: SlidersHorizontal,
  label: "Assumptions",
  title: "Plan assumptions",
};

export const monthEnd: Screen = {
  href: "/close",
  icon: CalendarCheck,
  label: "Month end",
  title: "Month end",
};

export const cogitator: Screen = {
  href: "/cogitator",
  icon: Cpu,
  label: "Cogitator",
  title: "Next best trades",
};

// The screens in navigation order. Section numerals derive from this order,
// so inserting a screen renumbers every header after it and nothing else
// has to change. Only built screens appear, since a typed route cannot
// point at one that does not exist. The chance of success sits beside the
// dashboard, the two readings of where the plan goes, ahead of the
// screens it is read from. The month end and the cogitator close the
// list, since each says what to do rather than what the plan rests on:
// the month end checks the balances and says what moved the plan, and
// the cogitator, read from the target allocation at the end of the
// assumptions, says what to buy and sell next, which a month end
// closes on.
export const screens: readonly Screen[] = [
  dashboard,
  chance,
  accountsAndAssets,
  plan,
  progress,
  assumptions,
  monthEnd,
  cogitator,
];

// Section numerals are roman, decorative and consistent, never the only
// way to identify a screen. There are eight screens and no screen has
// more than six cards, so the numerals are listed rather than worked
// out; a place past the list is written in figures, so it shows rather
// than vanishing.
const numerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"] as const;

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
  return numeral(screens.indexOf(screen) + 1);
}

// The label a card within a screen opens with, "Sect. III.ii": the
// screen's numeral and the card's own in lower case, counted from one in
// the order the cards are read down the screen.
export function subsectionLabel(screen: Screen, place: number): string {
  return `Sect. ${sectionNumeral(screen)}.${numeral(place).toLowerCase()}`;
}

// The numeral for a place counted from one.
function numeral(place: number): string {
  return numerals[place - 1] ?? String(place);
}
