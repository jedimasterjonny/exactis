import type { JSX, ReactNode } from "react";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/kit/tabs";

interface ScreenTabsProps {
  readonly tabs: readonly [Tab, ...Tab[]];
}

// A tab of a screen: what it is called, and the regions it holds.
interface Tab {
  readonly children: ReactNode;
  readonly label: string;
}

// A screen's body split into tabs, for a screen holding more than reads
// down it at once: the tabs named across the top of the body and,
// beneath, the regions of the one open, stacked at the gap the body
// stacks them at. The first is open when the screen is, and which is
// open is the screen's own rather than its address's, so a screen read
// again opens on the first. A tab not open is kept, hidden, rather than
// drawn afresh when it is opened again, so what is on its way in it, an
// import or a pull, is still held when the tab is left and opened again
// rather than offered a second time. The open panel takes the focus
// after the tabs, and shows the ring every control here shows, which
// the registry's panel takes away.
export function ScreenTabs({ tabs }: ScreenTabsProps): JSX.Element {
  return (
    <Tabs className="gap-5" defaultValue={tabs[0].label}>
      <TabsList>
        {tabs.map(({ label }) => (
          <TabsTrigger key={label} value={label}>
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map(({ children, label }) => (
        <TabsContent
          className="grid gap-5 rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50"
          keepMounted
          key={label}
          value={label}
        >
          {children}
        </TabsContent>
      ))}
    </Tabs>
  );
}
