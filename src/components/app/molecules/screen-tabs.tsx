"use client";

import type { CSSProperties, JSX, ReactNode } from "react";

import { useEffect, useRef } from "react";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/kit/tabs";

interface ControlledTabs<TLabel extends string> {
  readonly onValueChange: (label: TLabel) => void;
  readonly open?: undefined;
  readonly value: TLabel;
}

type ScreenTabsProps<TLabel extends string> = (
  ControlledTabs<TLabel> | UncontrolledTabs
) & { readonly tabs: readonly [Tab<TLabel>, ...Tab<TLabel>[]] };

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
interface Tab<TLabel extends string = string> {
  readonly children: ReactNode;
  readonly label: TLabel;
}

interface UncontrolledTabs {
  readonly onValueChange?: undefined;
  readonly open?: string | undefined;
  readonly value?: undefined;
}

// A screen's body split into tabs, for a screen holding more than reads
// down it at once: the tabs named across the top of the body and,
// beneath, the regions of the one open, stacked at the gap the body
// stacks them at. In uncontrolled mode the tab the screen's address
// names is open when the screen is, by its label in lower case with a
// hyphen for each space, as glide-path names the glide path, and the
// first where it names none; in controlled mode the caller owns the
// active tab so cross-tab links inside one panel can switch to another.
// When a controlled tab switches programmatically while focus was not
// on the tab list (for example from a row opener inside a panel Base UI
// is about to mark inert), focus moves onto the newly opened panel so
// keyboard and screen-reader users never lose their place. A tab not
// open is kept, hidden, rather than drawn afresh when it is opened
// again, so what is on its way in it, an import or a pull, is still
// held when the tab is left and opened again rather than offered a
// second time. The open panel takes the focus after the tabs, and shows
// the ring every control here shows, which the registry's panel takes
// away. The tabs keep to the body's width: where their names are wider,
// on a phone or under larger text spacing, the row scrolls sideways
// inside it from its first tab, rather than widening the screen, and
// the tab open as the screen opens, and one the arrow keys reach, is
// scrolled into view. It scrolls only sideways, and is as tall as its
// tabs, so a scrollbar a desktop draws sits beneath them rather than
// over them. On a touch screen each tab is 44px tall. Where colours are
// forced, the open tab is filled in the system's highlight, its name in
// the highlight's text, and is kept from the forcing, which would draw
// the page's colour behind the name; kept, it would keep the registry's
// faint focus ring, so the ring is drawn in the system's text colour.
export function ScreenTabs<TLabel extends string = string>(
  props: ScreenTabsProps<TLabel>,
): JSX.Element {
  const { open, tabs, value } = props;
  const panelsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const previousValueRef = useRef<string | undefined>(value);
  const wasTabInteractionRef = useRef(false);

  useEffect(() => {
    const previous = previousValueRef.current;
    previousValueRef.current = value;
    if (value === undefined || previous === value) {
      return;
    }
    if (wasTabInteractionRef.current) {
      wasTabInteractionRef.current = false;
      return;
    }
    panelsRef.current.get(value)?.focus();
  }, [value]);

  const opening =
    tabs.find(
      ({ label }) => label.toLowerCase().replaceAll(" ", "-") === open,
    ) ?? tabs[0];
  function controlOf():
    | { readonly defaultValue: TLabel }
    | {
        readonly onValueChange: (next: unknown) => void;
        readonly value: TLabel;
      } {
    if (props.onValueChange === undefined) {
      return { defaultValue: opening.label };
    }
    const { onValueChange, value: current } = props;
    return {
      onValueChange: (next: unknown): void => {
        for (const tab of tabs) {
          if (tab.label === next) {
            wasTabInteractionRef.current = true;
            onValueChange(tab.label);
          }
        }
      },
      value: current,
    };
  }

  return (
    <Tabs className="relative min-w-0 gap-5" {...controlOf()}>
      <TabsList className="max-w-full justify-start overflow-x-auto overflow-y-hidden group-data-horizontal/tabs:h-auto">
        {tabs.map(({ label }) => (
          <TabsTrigger
            className="forced-colors:focus-visible:ring-[CanvasText] pointer-coarse:min-h-11 forced-colors:data-active:bg-[Highlight] forced-colors:data-active:text-[HighlightText] forced-colors:data-active:forced-color-adjust-none"
            key={label}
            value={label}
          >
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
          ref={(node) => {
            if (node === null) {
              panelsRef.current.delete(label);
            } else {
              panelsRef.current.set(label, node);
            }
          }}
          style={({ hidden: isHidden }) => (isHidden ? unseen : undefined)}
          value={label}
        >
          {children}
        </TabsContent>
      ))}
    </Tabs>
  );
}
