"use client";

import type { JSX, KeyboardEvent } from "react";

import { cn } from "cn";
import {
  ArrowDownWideNarrow,
  ChevronLeft,
  ChevronRight,
  Shuffle,
} from "lucide-react";
import { memo, useDeferredValue, useMemo, useState } from "react";

import type { Milestone } from "@/data/milestones";
import type { Plan, Spread } from "@/data/plan";
import type { Future, Grading, Outcome } from "@/engine/futures";

import { RowAction } from "@/components/app/atoms/row-action";
import { LabelledSwitch } from "@/components/app/molecules/labelled-switch";
import {
  FutureStory,
  HeldStory,
} from "@/components/app/organisms/future-story";
import { SectionCard } from "@/components/app/organisms/section-card";
import { CardContent } from "@/components/kit/card";
import { endWorthOf, marketsOf, outcomeOf, yearsIn } from "@/engine/futures";
import { useSeed } from "@/hooks/use-futures";
import { formatCount } from "@/lib/count";
import { chance, subsectionLabel } from "@/lib/nav";
import {
  lastingOutcomes,
  outcomeInks,
  outcomeNames,
  shortOutcomes,
} from "@/lib/outcomes";
import { storyOf } from "@/lib/story";

interface FuturesWallProps {
  readonly count: number;
  readonly futures: readonly Future[];
  readonly grading: Grading;
  readonly isDone: boolean;
  readonly milestones: readonly Milestone[];
  readonly plan: Plan;
  readonly projected: Future;
  readonly spread: Spread;
}

// A future on the wall: where it falls in the run, what it is graded
// as, and its years as the line its cell draws.
interface Placed {
  readonly future: Future;
  readonly line: string;
  readonly outcome: Outcome;
  readonly place: number;
}

// A cell's box, in the units its line is drawn in.
const across = 24;
const down = 16;

// The wall's grid, held and landed alike: cells about 18px wide on a
// phone and a tablet, so a tablet's wall fits its window, and 28px from
// a wide screen's breakpoint.
const grid =
  "grid grid-cols-[repeat(auto-fill,minmax(1.125rem,1fr))] gap-0.5 xl:grid-cols-[repeat(auto-fill,minmax(1.75rem,1fr))] xl:gap-1";

// The outcomes from the best to the worst, the order the bar the screen
// opens on runs in and the wall sorted reads in.
const ranked: readonly Outcome[] = [...lastingOutcomes, ...shortOutcomes];

// One future's cell: a button named for where the future falls in the
// run and what it came to, pressed while it is the one lived through,
// and the keyboard's one stop on the wall, drawing the future's line
// filled beneath in its outcome's ink. Focused, it rings its edge
// inside the outline it draws pressed, pushed out past the ring. Where
// colours are forced it keeps its ink, which is the outcome, filling in
// the system's highlight while pressed with its line in the highlight's
// text, and its focus drawn in the text's colour. Kept from drawing
// again while nothing of its own changes, since a thousand stand beside
// it and one is chosen at a time.
const Cell = memo(function Cell({
  future,
  isChosen,
  line,
  onPick,
  outcome,
  place,
}: {
  readonly future: Future;
  readonly isChosen: boolean;
  readonly line: string;
  readonly onPick: (future: Future) => void;
  readonly outcome: Outcome;
  readonly place: number;
}): JSX.Element {
  return (
    <button
      aria-label={`Future ${formatCount(place + 1)}, ${outcomeNames[outcome].toLowerCase()}`}
      aria-pressed={isChosen}
      className={cn(
        "aspect-[3/2] rounded-xs outline-offset-1 forced-color-adjust-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring aria-pressed:bg-foreground/10 aria-pressed:outline-2 aria-pressed:outline-foreground forced-colors:aria-pressed:bg-[Highlight] forced-colors:aria-pressed:text-[HighlightText]",
        outcomeInks[outcome],
      )}
      onClick={() => {
        onPick(future);
      }}
      tabIndex={isChosen ? 0 : -1}
      type="button"
    >
      <svg
        aria-hidden
        className="block size-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${String(across)} ${String(down)}`}
      >
        <path
          d={`${line}V${String(down)}H0Z`}
          fill="currentColor"
          fillOpacity={0.3}
        />
        <path
          d={line}
          data-slot="future-line"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </button>
  );
});

// Every future of the run as a cell of its own, in the order drawn or,
// sorted, from the one that leaves the most to the one that falls short
// first, so the share that lasts is an area read off the wall as the
// chance is a figure; and one of them lived through beneath, the middle
// future by what it leaves until another is chosen. Each cell draws
// what its future is worth year by year, on one scale for the whole
// wall, topped at the most the top quarter reaches, since on the top
// tenth's most futures lie flat along the foot, in its outcome's ink.
// The card holds the shape it lands in from the first paint: a slot for
// every future the run draws, hidden from a screen reader, which the
// line held in the story's place speaks for, and the story's frame. The
// cells, the scale, the middle future and the story are read once the
// run is whole, since until then the middle moves and every line would
// be drawn again at each hand-over, and drawn behind the landing, so a
// phone lands them in slices rather than one long task; a run changed
// is held at once. The sort is switched only once the run is whole,
// its switch named for the order the wall is in, and reorders at once.
// The cells are one stop for the keyboard: the arrows step through them
// in the order shown, up and down by a row, and Home and End reach the
// ends. A finger too broad for a cell steps with the previous and next
// buttons beside the badge, which step the same order, held while the
// run is drawn and at either end. A future is held by itself, so the
// same run handed back keeps it and another lives the middle through.
// What a reader chooses is said once, in a sentence a screen reader is
// told as it changes, and nothing is said as the run lands.
export function FuturesWall({
  count,
  futures,
  grading,
  isDone,
  milestones,
  plan,
  projected,
  spread,
}: FuturesWallProps): JSX.Element {
  const isLanded = useDeferredValue(isDone, false) && isDone;
  const [isSorted, setIsSorted] = useState(false);
  const [picked, setPicked] = useState<Future | undefined>();
  const seed = useSeed();
  const landed = useMemo(() => {
    if (!isLanded) {
      return undefined;
    }
    const years = yearsIn(futures, plan);
    const ceiling = Math.max(1, ...years.map(({ topQuarter }) => topQuarter));
    const placed = futures.map((future, place): Placed => ({
      future,
      line: lineOf(future, ceiling),
      outcome: outcomeOf(future, grading),
      place,
    }));
    return {
      middle: placed.toSorted(byWorth)[Math.floor(placed.length / 2)],
      placed,
      years,
    };
  }, [futures, grading, isLanded, plan]);
  const shown = useMemo(() => {
    const placed = landed?.placed ?? [];
    return isSorted ? placed.toSorted(byEnding) : placed;
  }, [isSorted, landed]);
  const chosen =
    landed?.placed.find(({ future }) => future === picked) ?? landed?.middle;
  const lived = useMemo(
    () =>
      chosen === undefined || landed === undefined
        ? undefined
        : {
            chosen,
            story: storyOf(chosen.future, {
              markets: marketsOf({ future: chosen.place, plan, seed, spread }),
              milestones,
              outcome: chosen.outcome,
              place: chosen.place,
              plan,
              projected,
            }),
            years: landed.years,
          },
    [chosen, landed, milestones, plan, projected, seed, spread],
  );
  const at = lived === undefined ? -1 : shown.indexOf(lived.chosen);

  function step(event: KeyboardEvent<HTMLDivElement>): void {
    const columns = getComputedStyle(
      event.currentTarget,
    ).gridTemplateColumns.split(" ").length;
    const to =
      new Map([
        ["ArrowDown", at + columns],
        ["ArrowLeft", at - 1],
        ["ArrowRight", at + 1],
        ["ArrowUp", at - columns],
        ["End", shown.length - 1],
        ["Home", 0],
      ]).get(event.key) ?? -1;
    const next = shown[to];
    if (next !== undefined) {
      event.preventDefault();
      setPicked(next.future);
      event.currentTarget.querySelectorAll("button")[to]?.focus();
    }
  }

  const stepper = (
    <span className="flex shrink-0 gap-1">
      {[
        { by: -1, icon: ChevronLeft, isEnd: at <= 0, name: "Previous future" },
        {
          by: 1,
          icon: ChevronRight,
          isEnd: at >= shown.length - 1,
          name: "Next future",
        },
      ].map(({ by, icon, isEnd, name }) => (
        <RowAction
          disabled={lived === undefined || isEnd}
          icon={icon}
          key={name}
          name={name}
          onClick={() => {
            setPicked(shown[at + by]?.future);
          }}
        />
      ))}
    </span>
  );

  return (
    <SectionCard
      caption={
        "Each cell is one future's net worth year by year, in today's\u00a0money. Choose one to live it through."
      }
      controls={
        <LabelledSwitch
          className="justify-self-start"
          icon={isSorted ? ArrowDownWideNarrow : Shuffle}
          isChecked={isSorted}
          isDisabled={lived === undefined}
          onCheckedChange={setIsSorted}
        >
          {isSorted ? "By how they end" : "As drawn"}
        </LabelledSwitch>
      }
      label={subsectionLabel(chance, 6)}
      title="The futures, one by one"
    >
      <CardContent className="grid grid-cols-1 gap-8">
        {landed === undefined ? (
          <div aria-hidden className={grid} data-slot="wall-held">
            {Array.from({ length: count }, (_, slot) => (
              <span
                className="aspect-[3/2] rounded-xs bg-muted/60 forced-color-adjust-none"
                data-slot="future-slot"
                key={slot}
              />
            ))}
          </div>
        ) : (
          <div
            aria-label={`The ${formatCount(futures.length)} futures drawn`}
            className={grid}
            onKeyDown={step}
            role="toolbar"
          >
            {shown.map(({ future, line, outcome, place }) => (
              <Cell
                future={future}
                isChosen={future === lived?.chosen.future}
                key={place}
                line={line}
                onPick={setPicked}
                outcome={outcome}
                place={place}
              />
            ))}
          </div>
        )}
        <p aria-live="polite" className="sr-only" data-slot="said">
          {lived !== undefined && lived.chosen.future === picked
            ? `${outcomeNames[lived.chosen.outcome]}. ${lived.story.headline}`
            : ""}
        </p>
        {lived === undefined ? (
          <HeldStory plan={plan} stepper={stepper} />
        ) : (
          <FutureStory
            future={lived.chosen.future}
            outcome={lived.chosen.outcome}
            plan={plan}
            projected={projected}
            stepper={stepper}
            story={lived.story}
            years={lived.years}
          />
        )}
      </CardContent>
    </SectionCard>
  );
}

// The futures from the one that ends best to the one that ends worst:
// by outcome, then by when each fell short, the latest first, one that
// never did coming after every year, as those that lasted and one that
// never retired do; and those alike in that by what they leave, the
// most first.
function byEnding(first: Placed, second: Placed): number {
  const byOutcome =
    ranked.indexOf(first.outcome) - ranked.indexOf(second.outcome);
  if (byOutcome !== 0) {
    return byOutcome;
  }
  const fellIn = ({ future }: Placed): number =>
    future.fell ?? Number.POSITIVE_INFINITY;
  const byFall =
    fellIn(first) === fellIn(second) ? 0 : fellIn(second) - fellIn(first);
  return byFall === 0
    ? endWorthOf(second.future) - endWorthOf(first.future)
    : byFall;
}

// The futures by what they are worth at the plan's end, the least
// first.
function byWorth(first: Placed, second: Placed): number {
  return endWorthOf(first.future) - endWorthOf(second.future);
}

// A future's years as the line its cell draws: its worth entering each,
// left to right across the cell, from nothing at the foot to the
// ceiling given at the top, held to the cell either way.
function lineOf({ measured }: Future, ceiling: number): string {
  const last = Math.max(measured.length - 1, 1);
  return measured
    .map(({ worth }, offset) => {
      const x = (offset / last) * across;
      const y = down * (1 - Math.min(Math.max(worth / ceiling, 0), 1));
      return `${offset === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join("");
}
