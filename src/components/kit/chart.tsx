"use client";

import type { ComponentProps, JSX } from "react";

import { ChartContainer as ChartContainerBase } from "@/components/ui/chart";

// The chart, which closes its tooltip when a finger lands anywhere
// outside it. recharts closes the tooltip when the pointer leaves the
// chart and when the chart loses focus, and a tap opens it with both,
// but Safari on iOS sends neither for a tap on what it does not count
// as clickable, the page's blank space among it, so the tooltip stayed
// open until something that was clickable was tapped. A touch outside
// sends the chart the two events itself, as Chrome does unprompted. A
// mouse needs neither: it leaves the chart before it can press outside.
export function ChartContainer(
  props: Readonly<Omit<ComponentProps<typeof ChartContainerBase>, "ref">>,
): JSX.Element {
  return <ChartContainerBase {...props} ref={closeOnTouchAway} />;
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
