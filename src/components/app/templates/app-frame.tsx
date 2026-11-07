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
  readonly nav: ReactNode;
  readonly sidebar: ReactNode;
}

// The shell every signed-in screen sits in: the ink sidebar, holding
// whatever the route hands it, and the main column beside it. The inset is
// the page's one main landmark, so screens render their content directly.
// On a phone the sidebar is off canvas and a trigger in a bar above the
// screen opens it as a sheet, with the screen's section label beside it
// in place of the header's. The banner, whatever the route hands it, runs
// across the top of the main column above that bar, so it heads every
// screen at every width. The tab bar the route hands it, fixed along the
// foot of a phone's screen, sits after the main column, so it is reached
// after the screen, and inside the provider, so it can open the sheet. On
// a phone the main column is padded at its foot by the bar's height, so
// its last card scrolls clear of the bar.
export function AppFrame({
  banner,
  children,
  nav,
  sidebar,
}: AppFrameProps): JSX.Element {
  return (
    <SidebarProvider>
      <Sidebar>{sidebar}</Sidebar>
      <SidebarInset className="max-md:pb-(--phone-nav)">
        {banner}
        <div className="flex h-12 items-center gap-2 border-b bg-card px-4 md:hidden">
          <SidebarTrigger />
          <ScreenLabel />
        </div>
        {children}
      </SidebarInset>
      {nav}
    </SidebarProvider>
  );
}
