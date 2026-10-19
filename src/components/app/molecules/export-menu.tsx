"use client";

import type { JSX } from "react";

import { Download } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/kit/dropdown-menu";
import { SidebarMenuButton } from "@/components/kit/sidebar";

// The sidebar footer's export: one menu, drawn as sign-out's button is,
// for the two files the route hands out, what is open as a file to read
// back in and its balances as a row of the owner's sheet, so both are
// found in the one place. Neither says household, since a scenario may
// be the one open. Each is a plain link to the route, whose own header
// makes the browser save what it answers, so a redirect to the login
// screen, as an expired session gets, shows that screen rather than
// being saved as the file.
export function ExportMenu(): JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton className="-mx-2 label text-xs text-sidebar-foreground/60 [&_svg]:size-3.5" />
        }
      >
        <Download aria-hidden />
        Export
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem render={<a href="/export">JSON file</a>} />
        <DropdownMenuItem render={<a href="/export?as=csv">Balances CSV</a>} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
