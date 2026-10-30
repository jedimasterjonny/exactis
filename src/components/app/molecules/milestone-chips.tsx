import type { JSX } from "react";

import { cn } from "cn";
import { Flag } from "lucide-react";

import type { Marker } from "@/data/milestones";
import type { Tie } from "@/data/schedule";

import { formatWholePercent } from "@/lib/money";

interface MilestoneChipsProps {
  readonly markers: readonly Marker[];
  readonly onSelect: (tie: Tie) => void;
  readonly selected?: Tie | undefined;
  readonly unplaced?: readonly Unplaced[];
}

// A milestone the futures have not placed on the years: the share of
// them that reach it, fewer than half, or null while they are drawn.
interface Unplaced {
  readonly id: number;
  readonly name: string;
  readonly reached: null | number;
}

// The milestones as a row of chips, one chosen at a time, or none: each a button
// naming its milestone after the flag the plan screen ties a line to one
// with, its flag in ink, the palette's colour for milestones, as the
// chart rules them, and pressed while it is the one chosen and then
// filled in oxide, which marks the choice. A chip gives its flag and its
// year beside its name where there is room, and on a phone its name
// alone, so three fit a row there and the plot keeps its height, and the
// year of the one chosen is read where the choice is shown. The year is
// the name's size, set back from it by its weight and, on a chip not
// chosen, its tone: a smaller figure centred beside the name stood a pixel above its line.
// A milestone the caller says the futures have not placed follows them
// as a chip that cannot be pressed, dashed and muted, so it is seen to
// be off the years rather than missing: with an ellipsis where its year
// will be while they are drawn, and once they are, the share of them
// that reach it, said to a screen reader as that. The chips are drawn 32px tall and
// reach 44px for a finger past their own edges, so a row of them stays
// compact. The row is a group named for a screen reader, and each chip
// says whether it is the one chosen.
export function MilestoneChips({
  markers,
  onSelect,
  selected,
  unplaced = [],
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
              className="size-3.5 max-sm:hidden"
              data-slot="milestone-chip-flag"
            />
            {marker.name}{" "}
            <span
              className={cn(
                "figure font-normal max-sm:hidden",
                !isChosen && "text-muted-foreground",
              )}
            >
              {marker.year}
            </span>
          </button>
        );
      })}
      {unplaced.map(({ id, name, reached }) => (
        <span
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed px-3 text-sm font-medium text-muted-foreground"
          data-slot="milestone-chip-unplaced"
          key={id}
        >
          <Flag aria-hidden className="size-3.5 max-sm:hidden" />
          {name}{" "}
          <span className="figure font-normal max-sm:hidden">
            {reached === null ? (
              "…"
            ) : (
              <>
                <span className="sr-only">reached in </span>
                {formatWholePercent(reached)}
              </>
            )}
          </span>
        </span>
      ))}
    </div>
  );
}
