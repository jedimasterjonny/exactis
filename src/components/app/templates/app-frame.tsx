import type { JSX, ReactNode } from "react";

import { LogOut } from "lucide-react";

import { signOut } from "@/actions/auth";
import { ScreenLabel } from "@/components/app/atoms/screen-label";
import { AppNav } from "@/components/app/molecules/app-nav";
import { ExportMenu } from "@/components/app/molecules/export-menu";
import { HouseholdImport } from "@/components/app/organisms/household-import";
import { ThemeToggle } from "@/components/app/organisms/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/kit/sidebar";

interface AppFrameProps {
  readonly banner: ReactNode;
  readonly children: ReactNode;
}

// The shell every signed-in screen sits in: the ink sidebar with the wordmark,
// the navigation, the theme toggle, export and import, sign-out and the motto,
// and the main column beside it. The inset is the page's one main landmark, so
// screens render their content directly. On a phone the sidebar is off
// canvas and a trigger above the screen opens it as a sheet, with the
// screen's section label beside it in place of the header's. Sign-out is a
// form posting to its action, so it works before the page hydrates and
// needs no client code of its own. Its button is the registry's, so hover
// and focus come from where the navigation's do, but the footer's
// micro-label type is laid back over it: this row reads with the motto
// below it, not the navigation above. The export and the import above
// sign-out are drawn as the same button: the export a menu of the two
// files the route hands out, and the import asking before a file
// replaces what is open. The banner, whatever the route hands it, runs
// across the top of the main column above the phone's bar, so it heads
// every screen at every width.
export function AppFrame({ banner, children }: AppFrameProps): JSX.Element {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="px-4 pt-5 pb-4">
          <span className="flex items-center gap-2 font-heading text-lg font-bold tracking-[-0.03em] uppercase">
            Exactis
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-sidebar-primary"
            />
          </span>
        </SidebarHeader>
        <SidebarContent className="px-2">
          <AppNav />
        </SidebarContent>
        <SidebarFooter className="gap-3 px-4 pb-5">
          <ThemeToggle />
          <ExportMenu />
          <HouseholdImport />
          <form action={signOut} aria-label="Sign out">
            <SidebarMenuButton
              className="-mx-2 label text-xs text-sidebar-foreground/60 [&_svg]:size-3.5"
              type="submit"
            >
              <LogOut aria-hidden />
              Sign out
            </SidebarMenuButton>
          </form>
          {/* The one Latin motto, and the whole of the 40k licence. */}
          <span className="label text-sidebar-foreground/60">
            Certitudo in numeris
          </span>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        {banner}
        <div className="flex h-12 items-center gap-2 border-b bg-card px-4 md:hidden">
          <SidebarTrigger />
          <ScreenLabel />
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
