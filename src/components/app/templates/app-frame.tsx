import type { JSX, ReactNode } from "react";

import { ScreenLabel } from "@/components/app/atoms/screen-label";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/kit/sidebar";

interface AppFrameProps {
  readonly banner: ReactNode;
  readonly children: ReactNode;
  readonly sidebar: ReactNode;
}

// The shell every signed-in screen sits in: the ink sidebar, holding
// whatever the route hands it, and the main column beside it. The inset is
// the page's one main landmark, so screens render their content directly.
// On a phone the sidebar is off canvas and a trigger above the screen
// opens it as a sheet, with the screen's section label beside it in place
// of the header's. The banner, whatever the route hands it, runs across
// the top of the main column above the phone's bar, so it heads every
// screen at every width.
export function AppFrame({
  banner,
  children,
  sidebar,
}: AppFrameProps): JSX.Element {
  return (
    <SidebarProvider>
      <Sidebar>{sidebar}</Sidebar>
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
