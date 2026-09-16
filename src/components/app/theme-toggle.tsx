"use client";

import type { JSX } from "react";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Switch } from "@/components/kit/switch";

// Daylight is the default and the intended theme; night watch is opt-in,
// as the reference has it. The switch fills with the sidebar's oxide when
// on, since the registry's primary fill is ink, which vanishes on the ink
// sidebar.
export function ThemeToggle(): JSX.Element {
  const { setTheme, theme } = useTheme();
  const isClient = useSyncExternalStore(subscribe, isHydrated, isServer);
  const isDark = isClient && theme === "dark";
  const Icon = isDark ? Moon : Sun;
  return (
    <label className="flex h-8 items-center gap-2 label text-sidebar-foreground/60">
      <Icon aria-hidden className="size-3.5" />
      <span className="flex-1">{isDark ? "Night watch" : "Daylight"}</span>
      <Switch
        checked={isDark}
        className="data-checked:bg-sidebar-primary"
        onCheckedChange={(isChecked) => {
          setTheme(isChecked ? "dark" : "light");
        }}
        size="sm"
      />
    </label>
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
