import type { JSX, ReactNode } from "react";

import { AppNav } from "@/components/app-nav";
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

// The shell every screen sits in: the ink sidebar with the wordmark, the
// navigation and the motto, and the main column beside it. The inset is
// the page's one main landmark, so screens render their content directly.
// On a phone the sidebar is off canvas and a trigger above the screen
// opens it as a sheet.
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
        <SidebarFooter className="px-4 pb-5">
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
