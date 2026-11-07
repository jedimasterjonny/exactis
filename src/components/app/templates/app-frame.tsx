import type { JSX, ReactNode } from "react";

import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
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
// On a phone the sidebar is off canvas, a sheet the tab bar's More opens.
// The banner, whatever the route hands it, runs across the top of the
// main column, so it heads every screen at every width. The tab bar the
// route hands it, fixed along the foot of a phone's screen, sits after
// the main column, so it is reached after the screen, and inside the
// provider, so it can open the sheet. On a phone the main column is
// padded at its foot by the bar's height, so its last card scrolls clear
// of the bar.
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
        {children}
      </SidebarInset>
      {nav}
    </SidebarProvider>
  );
}
