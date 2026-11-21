import type { JSX } from "react";

import { cn } from "cn";
import { Flag } from "lucide-react";

import type { Marker, Unplaced } from "@/data/milestones";
import type { Tie } from "@/data/schedule";

import { formatWholePercent } from "@/lib/money";

interface MilestoneChipsProps {
  readonly markers: readonly (Marker | Unplaced)[];
  readonly onSelect: (tie: Tie) => void;
  readonly selected?: Tie | undefined;
}

// The milestones as a row of chips, one chosen at a time, or none: each
// a button naming its milestone after the flag the plan screen ties a
// line to one with, its flag in ink, the palette's colour for
// milestones, as the chart rules them, and pressed while it is the one
// chosen and then filled in oxide, which marks the choice. A chip gives
// its flag and its year beside its name where there is room, and on a
// phone its name alone, so more of them show at once there, and the
// year of the one chosen is read where the choice is shown. The year is
// the name's size, set back from it by its weight and, on a chip not
// chosen, its tone: a smaller figure centred beside the name stood a
// pixel above its line. A milestone the caller says the futures have
// not placed is a chip that cannot be pressed, in the place the caller
// gives it among the rest, dashed and muted, so it is seen to be off
// the years rather than missing: with an ellipsis where its year will be
// while they are drawn, and once they are, the share of them that reach
// it, said to a screen reader as that. A year, an ellipsis and a share
// are held to one width, four figures', so a chip keeps its width as its
// milestone is placed and the row wraps where it did. The chips are drawn
// 32px tall and reach 44px for a finger past their own edges, so a row of
// them stays compact; the reach is laid about the chip's middle, since
// one laid from its edges starts inside its border and comes up 2px
// short. The row is a group named for a screen reader, and each chip says
// whether it is the one chosen. Where colours are forced, the chip chosen
// is filled in the system's highlight, its name in the highlight's text,
// and is kept from the forcing, which would draw the page's colour behind
// the name; kept, its focus is still drawn in the system's text colour,
// by the focus rule every control takes there.
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
        if ("reached" in marker) {
          return (
            <span
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed px-3 text-sm font-medium text-muted-foreground"
              data-slot="milestone-chip-unplaced"
              key={marker.id}
            >
              <Flag aria-hidden className="size-3.5 max-sm:hidden" />
              {marker.name}{" "}
              <span className="min-w-[4ch] figure font-normal max-sm:hidden">
                {marker.reached === null ? (
                  "…"
                ) : (
                  <>
                    <span className="sr-only">reached in </span>
                    {formatWholePercent(marker.reached)}
                  </>
                )}
              </span>
            </span>
          );
        }
        const isChosen = marker.id === selected;
        return (
          <button
            aria-pressed={isChosen}
            className={cn(
              "relative inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium after:absolute after:inset-x-0 after:inset-y-[calc(50%-22px)] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-hidden",
              isChosen
                ? "border-brand bg-brand text-brand-foreground forced-colors:border-[Highlight] forced-colors:bg-[Highlight] forced-colors:text-[HighlightText] forced-colors:forced-color-adjust-none"
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
                "min-w-[4ch] figure font-normal max-sm:hidden",
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
