"use client";

import type { ComponentProps, JSX } from "react";

import { cn } from "cn";

import { ChartContainer as ChartContainerBase } from "@/components/ui/chart";

// The chart, which closes its tooltip when a finger lands anywhere
// outside it, and is ringed while it has the keyboard's focus. recharts
// closes the tooltip when the pointer leaves the chart and when the
// chart loses focus, and a tap opens it with both, but Safari on iOS
// sends neither for a tap on what it does not count as clickable, the
// page's blank space among it, so the tooltip stayed open until
// something that was clickable was tapped. A touch outside sends the
// chart the two events itself, as Chrome does unprompted. A mouse needs
// neither: it leaves the chart before it can press outside. The surface
// recharts hands the focus to is drawn with no outline by the vendored
// container, so the keyboard reached it unseen; the ring is the
// controls' own, an outline on the same path with one pseudo-class
// more, so it wins without overriding anything else, and a mouse, which
// never focuses visibly, never shows it; under forced colours the global
// focus rule draws it in the system's text colour. The axes' labels are
// drawn in the muted ink: recharts 3 moved the tick text out of the
// group the vendored container's class for them looks inside, so they
// kept recharts' own grey, too faint on the dark theme's card. What is
// drawn past the surface's edge is drawn rather than cut, so a tick or a
// label widened by spaced text keeps its first and last letters, into
// the card's padding; a series stays within the plot, its domain fitted
// to it, and where an axis lets data run past it recharts clips the
// series there. A press on a series focuses the layer recharts draws it
// in, which is never tabbed to, and is drawn with no outline, so a mouse
// or a finger leaves no frame round part of the plot.
export function ChartContainer({
  className,
  ...props
}: Readonly<
  Omit<ComponentProps<typeof ChartContainerBase>, "ref">
>): JSX.Element {
  return (
    <ChartContainerBase
      {...props}
      className={cn(
        "[&_.recharts-cartesian-axis-tick-value]:fill-muted-foreground [&_.recharts-surface]:overflow-visible [&_.recharts-surface:focus-visible]:rounded-md [&_.recharts-surface:focus-visible]:outline-3 [&_.recharts-surface:focus-visible]:outline-offset-2 [&_.recharts-surface:focus-visible]:outline-ring/50 [&_.recharts-surface:focus-visible]:outline-solid [&_g[tabindex='-1']]:outline-none",
        className,
      )}
      ref={closeOnTouchAway}
    />
  );
}

// Listens, for as long as the chart is mounted, for a touch landing
// outside it, and sends what it is missing to the wrapper recharts
// listens on and to whatever inside it has focus.
function closeOnTouchAway(chart: HTMLDivElement): () => void {
  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType !== "touch" || event.composedPath().includes(chart)) {
      return;
    }
    chart
      .querySelector(".recharts-wrapper")
      ?.dispatchEvent(
        new MouseEvent("mouseout", {
          bubbles: true,
          relatedTarget: event.target,
        }),
      );
    const focused = chart.querySelector(":focus");
    if (focused instanceof SVGElement) {
      focused.blur();
    }
  };
  document.addEventListener("pointerdown", onPointerDown);
  return (): void => {
    document.removeEventListener("pointerdown", onPointerDown);
  };
}

export { ChartTooltip } from "@/components/ui/chart";
