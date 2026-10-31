"use client";

import type { JSX } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, use } from "react";

import { Badge } from "@/components/kit/badge";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/kit/sidebar";
import { monthEnd, screens, sectionNumeral } from "@/lib/nav";

interface AppNavProps {
  readonly isDue: Promise<boolean>;
}

// One item per built screen, in navigation order, each with its icon, its
// label and the numeral its header carries. The current screen is marked
// from the pathname. The month end is badged Due while last month is
// still to be closed, which the layout reads from the store and hands
// down unawaited, so the navigation draws at once and the badge joins
// it when the read is in. A client component, since the pathname is
// read on the client and an icon is a component, which cannot cross the
// server boundary as a prop.
export function AppNav({ isDue }: AppNavProps): JSX.Element {
  const pathname = usePathname();
  return (
    <SidebarMenu>
      {screens.map((screen) => (
        <SidebarMenuItem key={screen.href}>
          <SidebarMenuButton
            isActive={pathname === screen.href}
            render={<Link href={screen.href} />}
          >
            <screen.icon aria-hidden />
            <span>{screen.label}</span>
            {screen === monthEnd && (
              <Suspense fallback={null}>
                <Due isDue={isDue} />
              </Suspense>
            )}
            <span className="ml-auto label text-sidebar-foreground/60">
              {sectionNumeral(screen)}
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}

// The badge saying the month end is due, or nothing while it is not.
function Due({ isDue }: AppNavProps): JSX.Element | null {
  return use(isDue) ? <Badge variant="caution">Due</Badge> : null;
}
