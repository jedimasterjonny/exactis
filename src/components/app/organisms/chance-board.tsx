"use client";

import type { JSX, ReactNode } from "react";

import { Dices, PiggyBank } from "lucide-react";
import { useMemo } from "react";

import type { Account } from "@/data/accounts";
import type { Shortfall } from "@/data/cma";
import type { Plan, Spread } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";
import type { Future } from "@/engine/futures";

import { Caution } from "@/components/app/atoms/caution";
import { EmptyState } from "@/components/app/atoms/empty-state";
import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { SectionCard } from "@/components/app/molecules/section-card";
import { FuturesCount } from "@/components/app/organisms/futures-count";
import { CardContent } from "@/components/kit/card";
import { takesSpare } from "@/data/accounts";
import { ageIn, endAge } from "@/data/plan";
import { futureOf, readingOf } from "@/engine/futures";
import { project } from "@/engine/projection";
import { useFutures } from "@/hooks/use-futures";
import { formatCount } from "@/lib/count";
import { formatGbp, formatWholePercent } from "@/lib/money";
import { chance, sectionLabel, subsectionLabel } from "@/lib/nav";

interface ChanceBoardProps {
  readonly accounts: readonly Account[];
  readonly plan: Plan;
  readonly schedule: Schedule;
  readonly spread: Shortfall | Spread;
}

// How many futures a run draws: enough to pin the chance to within two
// points either way, and few enough that the run is a matter of
// seconds.
const count = 1000;

// The chance of success: the plan run over a thousand futures of the
// markets, drawn as the screen opens, a slice at a time, with the header
// saying what they come to as the screen's siblings say what theirs do,
// and the cards beneath. Every run draws the same futures, so there is
// nothing to run again and no button to. There is nothing to draw while
// the plan has no spread, the CMA giving it none, or no savings for the
// futures to grow, and the screen says which.
export function ChanceBoard({
  accounts,
  plan,
  schedule,
  spread,
}: ChanceBoardProps): JSX.Element {
  if ("short" in spread) {
    return (
      <Unrun
        description={`${spread.short}, so there is nothing to draw the futures at. The CMA is pulled and mapped on Assumptions.`}
        headline="No spread to draw the futures from"
        icon={Dices}
      />
    );
  }
  if (!accounts.some(takesSpare)) {
    return (
      <Unrun
        description="Add a pension, an ISA or a savings account on Accounts & assets. The futures draw their returns on what the savings hold."
        headline="No savings for the futures to grow"
        icon={PiggyBank}
      />
    );
  }
  return (
    <Futures
      accounts={accounts}
      plan={plan}
      schedule={schedule}
      spread={spread}
    />
  );
}

// What the plan comes to at its own rates, where it falls short at them:
// running out, said with the year it does, or lasting only by drawing a
// pension before it can be drawn, which the futures count as falling
// short, said so the chance is not read as the markets' doing alone.
// Nothing where the plan lasts at its own rates.
function AtItsRates({
  future,
  plan,
}: {
  readonly future: Future;
  readonly plan: Plan;
}): JSX.Element | null {
  if (future.ranOut !== null) {
    return (
      <Caution
        title={`The plan runs out at ${String(ageIn(future.ranOut, plan))} even at its own rates`}
      >
        {`Income & expenses projects the savings running out in ${String(future.ranOut)}. The futures say how often the markets would carry it further.`}
      </Caution>
    );
  }
  if (future.fell !== null) {
    return (
      <Caution
        title={`The plan lasts at its own rates only by drawing a pension early, at ${String(ageIn(future.fell, plan))}`}
      >
        {`Income & expenses projects the savings carried from ${String(future.fell)} by a pension drawn before it can be, at the 55% charge. The futures count a draw like that as falling short.`}
      </Caution>
    );
  }
  return null;
}

// The plan's futures as they come in, under a header saying what they
// come to: the chance, by when a tenth of them have fallen short, where
// a tenth do, and what the middle one leaves; or, while they are coming
// in, how many have. The plan at its own rates is read as a future, for
// what it holds at the end beside the middle future, and a plan that
// falls short even at its own rates is said to before the count, since
// the chance then reads how often the markets would carry a plan that
// does not work as it stands.
function Futures({
  accounts,
  plan,
  schedule,
  spread,
}: Omit<ChanceBoardProps, "spread"> & {
  readonly spread: Spread;
}): JSX.Element {
  const { futures, isDone } = useFutures(accounts, schedule, {
    count,
    plan,
    spread,
  });
  const reading = readingOf(futures);
  const asProjected = useMemo(
    () => futureOf(project(accounts, schedule, plan), accounts),
    [accounts, plan, schedule],
  );
  const projected = readingOf([asProjected]);
  const headline = isDone
    ? [
        `${formatWholePercent(reading.chance)} of ${formatCount(count)} futures last to ${String(endAge(plan))}`,
        ...(reading.tenthFell === null
          ? []
          : [
              `a tenth fall short by ${String(ageIn(reading.tenthFell, plan))}`,
            ]),
        `the middle one leaves ${formatGbp(reading.middle)}`,
      ].join(" · ")
    : `Drawing ${formatCount(futures.length)} of ${formatCount(count)} futures…`;
  return (
    <Screen headline={headline}>
      <AtItsRates future={asProjected} plan={plan} />
      <FuturesCount
        count={count}
        plan={plan}
        projected={projected.middle}
        reading={reading}
      />
    </Screen>
  );
}

// The screen's header, saying what it comes to, over its body.
function Screen({
  children,
  headline,
}: {
  readonly children: ReactNode;
  readonly headline: string;
}): JSX.Element {
  return (
    <>
      <ScreenHeader label={sectionLabel(chance)} title={chance.title}>
        {headline}
      </ScreenHeader>
      <ScreenBody>{children}</ScreenBody>
    </>
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
    <Screen headline={headline}>
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
