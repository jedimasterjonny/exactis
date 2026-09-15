import type { JSX, ReactNode } from "react";

import { LogOut } from "lucide-react";

import { signOut } from "@/app/login/actions";
import { AppNav } from "@/components/app-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

interface AppFrameProps {
  readonly children: ReactNode;
}

// The shell every signed-in screen sits in: the ink sidebar with the
// wordmark, the navigation, the theme toggle, sign-out and the motto, and
// the main column beside it. The inset is the page's one main landmark, so
// screens render their content directly. On a phone the sidebar is off
// canvas and a trigger above the screen opens it as a sheet. Sign-out is a
// form posting to its action, so it works before the page hydrates and
// needs no client code of its own.
export function AppFrame({ children }: AppFrameProps): JSX.Element {
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
          <form action={signOut} aria-label="Sign out">
            <button
              className="flex h-8 w-full items-center gap-2 label text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground focus-visible:text-sidebar-foreground focus-visible:outline-none"
              type="submit"
            >
              <LogOut aria-hidden className="size-3.5" />
              Sign out
            </button>
          </form>
          {/* The one Latin motto, and the whole of the 40k licence. */}
          <span className="label text-sidebar-foreground/60">
            Certitudo in numeris
          </span>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div className="flex h-12 items-center border-b bg-card px-4 md:hidden">
          <SidebarTrigger />
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
