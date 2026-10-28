"use client";

import type { JSX } from "react";

import { Dices, PiggyBank, RefreshCw } from "lucide-react";

import type { Account } from "@/data/accounts";
import type { Shortfall } from "@/data/cma";
import type { Milestone } from "@/data/milestones";
import type { Plan, Spread } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";

import { EmptyState } from "@/components/app/molecules/empty-state";
import { SectionCard } from "@/components/app/organisms/section-card";
import { Screen } from "@/components/app/templates/screen";
import { Button } from "@/components/kit/button";
import { CardContent } from "@/components/kit/card";
import { takesSpare } from "@/data/accounts";
import { ageIn, endAge } from "@/data/plan";
import { runLength } from "@/engine/futures";
import { drawAgain, useFutures } from "@/hooks/use-futures";
import { formatCount } from "@/lib/count";
import { chance, sectionLabel, subsectionLabel } from "@/lib/nav";

import { ChanceBoard } from "./chance-board";

interface ChanceScreenProps {
  readonly accounts: readonly Account[];
  readonly milestones: readonly Milestone[];
  readonly plan: Plan;
  readonly schedule: Schedule;
  readonly spread: Shortfall | Spread;
}

// The chance of success: the plan run over a thousand futures of the
// markets, drawn as the screen opens, a slice at a time, unless the
// dashboard has drawn them already, with the header saying how far the
// run has come and the cards beneath, the first of
// them saying what the futures come to. Every run draws the same
// futures, so a change in what they come to is the plan's, until the
// header's button draws them again over other markets, to see how far
// the chance rests on the markets drawn. There is nothing to draw while
// the plan has no spread, the CMA giving it none, or no savings for the
// futures to grow, and the screen says which.
export function ChanceScreen({
  accounts,
  milestones,
  plan,
  schedule,
  spread,
}: ChanceScreenProps): JSX.Element {
  if ("short" in spread) {
    return (
      <Unrun
        description={`${spread.short}. Set it on Assumptions.`}
        headline="No spread to draw the futures from"
        icon={Dices}
      />
    );
  }
  if (!accounts.some(takesSpare)) {
    return (
      <Unrun
        description="Add a pension, an ISA or a savings account on Accounts & assets."
        headline="No savings for the futures to grow"
        icon={PiggyBank}
      />
    );
  }
  return (
    <Futures
      accounts={accounts}
      milestones={milestones}
      plan={plan}
      schedule={schedule}
      spread={spread}
    />
  );
}

// The plan's futures as they come in, under a header saying how many
// there are and over what ages, or, while they are coming in, how many
// have, beside a button to draw them again; then the board, drawing
// what they come to. The run is read here and nowhere else, since the
// header and the board both read it, and a second reader would start a
// second pair of workers over the slices still to draw.
function Futures({
  accounts,
  milestones,
  plan,
  schedule,
  spread,
}: Omit<ChanceScreenProps, "spread"> & {
  readonly spread: Spread;
}): JSX.Element {
  const { futures, isDone } = useFutures(accounts, schedule, {
    count: runLength,
    plan,
    spread,
  });
  const headline = isDone
    ? `${formatCount(runLength)} futures, age ${String(ageIn(plan.from, plan))} to ${String(endAge(plan))}`
    : `Drawing ${formatCount(futures.length)} of ${formatCount(runLength)} futures…`;
  return (
    <Screen
      actions={
        <Button onClick={drawAgain} size="sm" variant="outline">
          <RefreshCw aria-hidden />
          Draw again
        </Button>
      }
      label={sectionLabel(chance)}
      meta={headline}
      title={chance.title}
    >
      <ChanceBoard
        accounts={accounts}
        futures={futures}
        milestones={milestones}
        plan={plan}
        schedule={schedule}
        spread={spread}
      />
    </Screen>
  );
}

// The screen with nothing to draw, saying why where the count would be.
function Unrun({
  description,
  headline,
  icon,
}: {
  readonly description: string;
  readonly headline: string;
  readonly icon: typeof Dices;
}): JSX.Element {
  return (
    <Screen label={sectionLabel(chance)} meta={headline} title={chance.title}>
      <SectionCard
        label={subsectionLabel(chance, 1)}
        title="How many futures last"
      >
        <CardContent>
          <EmptyState description={description} icon={icon} title={headline} />
        </CardContent>
      </SectionCard>
    </Screen>
  );
}
