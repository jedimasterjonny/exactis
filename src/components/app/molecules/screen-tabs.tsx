"use client";

import type { CSSProperties, JSX, ReactNode } from "react";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/kit/tabs";

interface ScreenTabsProps {
  readonly open?: string | undefined;
  readonly tabs: readonly [Tab, ...Tab[]];
}

// A panel not open: laid out at the width of the one open but at no
// height, out of the flow, and unseen. Base UI hides it with the hidden
// attribute, which the stylesheet makes display: none, and a chart sized
// to a box it was not given measured nothing there, warned, and drew a
// frame late when its tab was opened. Unseen, it keeps its box and
// stays out of the accessibility tree and, with Base UI's inert, out of
// the tab order.
const unseen: CSSProperties = {
  height: 0,
  insetInline: 0,
  overflow: "hidden",
  position: "absolute",
  visibility: "hidden",
};

// A tab of a screen: what it is called, and the regions it holds.
interface Tab {
  readonly children: ReactNode;
  readonly label: string;
}

// A screen's body split into tabs, for a screen holding more than reads
// down it at once: the tabs named across the top of the body and,
// beneath, the regions of the one open, stacked at the gap the body
// stacks them at. The one the screen's address names is open when the
// screen is, by its label in lower case with a hyphen for each space,
// as glide-path names the glide path, and the first where it names
// none; which is open after is the screen's own rather than its
// address's, so a tab chosen leaves the address as it was. A tab not
// open is kept, hidden, rather than drawn afresh when it is opened
// again, so what is on its way in it, an import or a pull, is still
// held when the tab is left and opened again rather than offered a
// second time. The open panel takes the focus after the tabs, and shows
// the ring every control here shows, which the registry's panel takes
// away.
export function ScreenTabs({ open, tabs }: ScreenTabsProps): JSX.Element {
  const opening =
    tabs.find(
      ({ label }) => label.toLowerCase().replaceAll(" ", "-") === open,
    ) ?? tabs[0];
  return (
    <Tabs className="relative gap-5" defaultValue={opening.label}>
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
          hidden={false}
          keepMounted
          key={label}
          style={({ hidden: isHidden }) => (isHidden ? unseen : undefined)}
          value={label}
        >
          {children}
        </TabsContent>
      ))}
    </Tabs>
  );
}
