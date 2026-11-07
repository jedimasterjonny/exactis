"use client";

import type { JSX } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { DueBadge } from "@/components/app/atoms/due-badge";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/kit/sidebar";
import { monthEnd, screens, sectionNumeral } from "@/lib/nav";

interface AppNavProps {
  readonly isDue: Promise<boolean>;
}

// One item per built screen, in navigation order, each with its icon, its
// label and the numeral its header carries, in a navigation landmark
// named Screens. The current screen is marked from the pathname, for the
// eye and as the page to a screen reader, and the numeral, which is
// decorative, is hidden from one, so a link is named by its label alone.
// On a phone, where the navigation sits in a sheet over the screen,
// choosing a screen closes the sheet, which the frame would otherwise
// keep open across the navigation; the current screen's own link closes
// it too. The month end is badged Due while last month is still to be
// closed, which the layout reads from the store and hands down
// unawaited, so the navigation draws at once and the badge joins it when
// the read is in. A client component, since the pathname is read on the
// client and an icon is a component, which cannot cross the server
// boundary as a prop.
export function AppNav({ isDue }: AppNavProps): JSX.Element {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  return (
    <nav aria-label="Screens">
      <SidebarMenu>
        {screens.map((screen) => {
          const isCurrent = pathname === screen.href;
          return (
            <SidebarMenuItem key={screen.href}>
              <SidebarMenuButton
                aria-current={isCurrent ? "page" : undefined}
                isActive={isCurrent}
                onClick={() => {
                  setOpenMobile(false);
                }}
                render={<Link href={screen.href} />}
              >
                <screen.icon aria-hidden />
                <span>{screen.label}</span>
                {screen === monthEnd && <DueBadge isDue={isDue} />}
                <span
                  aria-hidden
                  className="ml-auto label text-sidebar-foreground/60"
                >
                  {sectionNumeral(screen)}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </nav>
  );
}
