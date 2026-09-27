import type { JSX } from "react";

import { cn } from "cn";
import { Flag } from "lucide-react";

import type { Marker } from "@/data/milestones";
import type { Tie } from "@/data/schedule";

interface MilestoneChipsProps {
  readonly markers: readonly Marker[];
  readonly onSelect: (tie: Tie) => void;
  readonly selected: Tie;
}

// The milestones as a row of chips, one chosen at a time: each a button
// naming its milestone after the flag the plan screen ties a line to one
// with, pressed while it is the one chosen and then filled in oxide, the
// palette's colour for milestones, as the chart draws the chosen
// milestone's line. A chip gives its flag and its year beside its name
// where there is room, and on a phone its name alone, so three fit a
// row there and the plot keeps its height, and the year of the one
// chosen is read where the choice is shown. The chips are drawn 32px tall and
// reach 44px for a finger past their own edges, so a row of them stays
// compact. The row is a group named for a screen reader, and each chip
// says whether it is the one chosen.
export function MilestoneChips({
  markers,
  onSelect,
  selected,
}: MilestoneChipsProps): JSX.Element {
  return (
    <div
      aria-label="Milestones"
      className="flex flex-wrap gap-x-2 gap-y-3"
      role="group"
    >
      {markers.map((marker) => {
        const isChosen = marker.id === selected;
        return (
          <button
            aria-pressed={isChosen}
            className={cn(
              "relative inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium after:absolute after:inset-x-0 after:-inset-y-1.5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-hidden",
              isChosen
                ? "border-brand bg-brand text-brand-foreground"
                : "bg-card hover:bg-muted",
            )}
            key={marker.id}
            onClick={() => {
              onSelect(marker.id);
            }}
            type="button"
          >
            <Flag
              aria-hidden
              className={cn(
                "size-3.5 max-sm:hidden",
                !isChosen && "text-brand",
              )}
              data-slot="milestone-chip-flag"
            />
            {marker.name}{" "}
            <span
              className={cn(
                "figure text-xs font-normal max-sm:hidden",
                !isChosen && "text-muted-foreground",
              )}
            >
              {marker.year}
            </span>
          </button>
        );
      })}
    </div>
  );
}
