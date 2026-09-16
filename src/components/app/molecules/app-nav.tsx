"use client";

import type { JSX } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/kit/sidebar";
import { screens, sectionNumeral } from "@/lib/nav";

// One item per built screen, in navigation order, each with its icon, its
// label and the numeral its header carries. The current screen is marked
// from the pathname. A client component, since the pathname is read on
// the client and an icon is a component, which cannot cross the server
// boundary as a prop.
export function AppNav(): JSX.Element {
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
            <span className="ml-auto label text-sidebar-foreground/60">
              {sectionNumeral(screen)}
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
