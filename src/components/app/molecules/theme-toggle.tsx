"use client";

import type { JSX } from "react";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { LabelledSwitch } from "@/components/app/atoms/labelled-switch";

// Daylight is the default and the intended theme; night watch is opt-in,
// as the reference has it. The switch takes the sidebar tone, since it
// sits on the ink sidebar.
export function ThemeToggle(): JSX.Element {
  const { setTheme, theme } = useTheme();
  const isClient = useSyncExternalStore(subscribe, isHydrated, isServer);
  const isDark = isClient && theme === "dark";
  return (
    <LabelledSwitch
      icon={isDark ? Moon : Sun}
      isChecked={isDark}
      onCheckedChange={(isChecked) => {
        setTheme(isChecked ? "dark" : "light");
      }}
      tone="sidebar"
    >
      {isDark ? "Night watch" : "Daylight"}
    </LabelledSwitch>
  );
}

function isHydrated(): boolean {
  return true;
}

function isServer(): boolean {
  return false;
}

// The stored theme is known to the client before it is known to the
// server, so a toggle that read it during hydration would disagree with
// the markup it is hydrating. This store answers false while hydrating and
// true from the first render after, so the toggle reads as daylight, which
// is what the server drew, and then catches up.
function subscribe(): () => void {
  return (): void => {
    // Nothing to unsubscribe from: hydration happens once.
  };
}
