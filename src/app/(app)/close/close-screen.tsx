import type { JSX, ReactNode } from "react";

import { CalendarCheck, History } from "lucide-react";
import Link from "next/link";
import { Suspense, use } from "react";

import type { WorksheetRow } from "@/components/app/atoms/worksheet";
import type { Household, Kept } from "@/data/household";
import type { Plan } from "@/data/plan";
import type { Month } from "@/data/schedule";
import type { Answer } from "@/lib/answer";
import type { KeptClose, Landed, Passed } from "@/lib/landed";
import type { Group, Moved, RateSource, Standing } from "@/lib/moved";
import type { SinceClose } from "@/store/household";

import { Ledger } from "@/components/app/atoms/ledger";
import { Note } from "@/components/app/atoms/note";
import { PortfolioImport } from "@/components/app/atoms/portfolio-import";
import { Worksheet } from "@/components/app/atoms/worksheet";
import { EmptyState } from "@/components/app/molecules/empty-state";
import { MonthEnd } from "@/components/app/organisms/month-end";
import { SectionCard } from "@/components/app/organisms/section-card";
import { Screen } from "@/components/app/templates/screen";
import { buttonVariants } from "@/components/kit/button";
import { CardContent } from "@/components/kit/card";
import { ageIn } from "@/data/plan";
import { isDue } from "@/data/progress";
import { runLength } from "@/engine/futures";
import { laidOut } from "@/engine/projection";
import { answerOf, refused } from "@/lib/answer";
import { counted, formatCount } from "@/lib/count";
import { listed } from "@/lib/feeders";
import { landedSince } from "@/lib/landed";
import { formatGbp, formatSignedGbp } from "@/lib/money";
import {
  cutOf,
  formatDay,
  formatMonth,
  monthAfter,
  monthName,
  monthsBetween,
} from "@/lib/months";
import { areaNames, movedOver, movedSince, sourceNames } from "@/lib/moved";
import { cogitator, monthEnd, sectionLabel, subsectionLabel } from "@/lib/nav";

// A band of the futures as the card where the invested balances landed
// gives it, to three significant figures, so a small pot's band over a
// month is not rounded onto a single figure.
const banded = new Intl.NumberFormat("en-GB", {
  currency: "GBP",
  maximumSignificantDigits: 3,
  style: "currency",
});

// Why a close is passed over, as the note naming it says.
const passedWhy: Record<Passed["kind"], string> = {
  short: "its plan has no spread to draw futures from",
  unchecked: "no invested balance was checked at both it and this one",
  unreadable: "it is in a form this app cannot read",
};

// What each group of the walk is called as a row of what moved.
const groupNames: Record<Group, string> = {
  balances: "Balances against the plan",
  changes: "Your changes",
  rates: "Rates and their sources",
};

// The sources each tab of the assumptions screen holds, in its order.
const tabs: readonly (readonly RateSource[])[] = [
  ["rateSet", "rates", "cma", "curve", "deductions"],
  ["targets"],
  ["glide"],
];

interface CloseScreenProps {
  readonly closes: null | Promise<readonly KeptClose[]>;
  readonly household: Household;
  readonly isInScenario: boolean;
  readonly isUpdating: boolean;
  readonly month: Month;
  readonly since: null | SinceClose;
  readonly today: string;
}

// What moved the plan since the close before the latest, the month that
// close's balances were as of, and whether they alone were read, laid
// over the household now.
interface Compared {
  readonly asOf: Month;
  readonly isLaid: boolean;
  readonly moved: Moved;
}

// The month end: the month whose balances were cut last closed onto the
// household, and once it is, what moved the plan since the close before.
// The title gives the answer. Until the month is closed, which its latest
// progress point says, the screen is the worksheet that closes it,
// opening on that month, and says since when a month has been due: the
// cut of the month after the latest point's, or that none is closed yet
// with no point kept. Once it is, the balances the close set against those it
// closed from, with what the plan paid in beside what Portfolio
// Performance says was, where it says, what moved the plan since the
// close before as the steps movedSince takes, and what the plan paid into
// the ISAs and the GIAs, offered to the cogitator, and between the two
// where the invested balances landed among the futures of a close in
// the year before, once the closes given are read, in a boundary of its
// own so the rest is drawn first; with the next close
// due and what mostly moved said in the meta line, and the balances to
// update in the header, which opens the same worksheet on the month
// closed, for a close to be made again or another month picked, with the
// way back. A close before the latest kept in a form this app cannot read
// whole is compared by the balances it set alone, carried on by the plan
// now, which takes in the rates and the household's changes since, and
// the screen says so. A household with no close before the latest, one
// whose balances cannot be read either, one the rules refuse moved on
// now, or one whose balances have since been closed back onto that
// close's month or before it, has nothing to compare with, and says why.
// A month is closed in the household alone, so while a scenario is open
// the screen says to leave it, and nothing else, rather than lay the
// scenario's balances out to be refused. The month cut last and the day
// are given rather than read, as the household and the close before the
// latest are.
export function CloseScreen({
  closes,
  household,
  isInScenario,
  isUpdating,
  month: due,
  since,
  today,
}: CloseScreenProps): JSX.Element {
  const label = sectionLabel(monthEnd);
  if (isInScenario) {
    return (
      <Screen label={label} title={monthEnd.title}>
        <EmptyState
          description="Leave the scenario to close the month."
          icon={CalendarCheck}
          title="A month is closed in the household"
        />
      </Screen>
    );
  }
  const isOpen = isDue(household.points, due);
  const month = monthName(due.month, "long");
  const after = monthAfter(due);
  const next = `${monthName(after.month, "long")} closes from ${cutDay(after)}`;
  if (isOpen || isUpdating) {
    const { plan, schedule } = laidOut(
      household.accounts,
      household.schedule,
      household.plan,
    );
    const latest = household.points.at(-1)?.month;
    return (
      <Screen
        {...(!isOpen && {
          actions: (
            <Link
              className={buttonVariants({ size: "sm", variant: "outline" })}
              href={monthEnd.href}
            >
              What moved
            </Link>
          ),
        })}
        label={label}
        meta={isOpen ? dueSince(latest) : next}
        title={isOpen ? `${month} isn't closed yet` : `${month} is closed`}
      >
        <MonthEnd
          accounts={household.accounts}
          isUpdating={isUpdating}
          month={due}
          plan={plan}
          schedule={schedule}
          today={today}
        />
      </Screen>
    );
  }
  const compared = comparedOf(since, month);
  const update = (
    <Link
      className={buttonVariants({ size: "sm" })}
      href={`${monthEnd.href}?update`}
    >
      <CalendarCheck aria-hidden />
      Update balances
    </Link>
  );
  if (compared?.kind !== "saved") {
    return (
      <Screen
        actions={update}
        label={label}
        meta={next}
        title={`${month} is closed`}
      >
        <SectionCard label={subsectionLabel(monthEnd, 1)} title="What moved">
          <CardContent>
            <EmptyState
              description={
                compared === null
                  ? "What moved shows from the next close, once there is a close before it to compare with."
                  : compared.reason
              }
              icon={History}
              title="Nothing to compare with"
            />
          </CardContent>
        </SectionCard>
      </Screen>
    );
  }
  const { asOf, isLaid, moved } = compared.value;
  const { plan } = household;
  const rows = rowsOf(compared.value, plan);
  const most = rows
    .slice(1, -1)
    .toSorted((one, other) => Math.abs(other.liquid) - Math.abs(one.liquid))[0];
  return (
    <Screen
      actions={update}
      label={label}
      meta={
        most === undefined
          ? next
          : `Mostly ${most.row.label.toLowerCase()} · ${next}`
      }
      title={titleOf(moved, month, plan)}
    >
      <SectionCard
        {...(moved.balances.unchecked > 0 && {
          caption: `${counted(moved.balances.unchecked, "balance")} left as it stood`,
        })}
        label={subsectionLabel(monthEnd, 1)}
        title={`Balances on ${formatDay(cutOf(due))}`}
      >
        <CardContent>
          <Ledger
            steps={[
              {
                detail: formatDay(cutOf(asOf)),
                figure: formatGbp(moved.balances.stood),
                label: "As the balances stood",
              },
              {
                ...(moved.balances.actual.length > 0 && {
                  detail: `${formatGbp(moved.balances.planned)} planned · ${moved.balances.actual.join(", ")} from Portfolio Performance`,
                }),
                figure: formatGbp(moved.balances.paid),
                label: "Paid in",
              },
              {
                detail: "Markets, interest and the unexpected",
                figure: formatGbp(moved.balances.moved),
                label: "Moved",
              },
            ]}
            total={formatGbp(moved.balances.now)}
            totalName={`As the balances stand on ${formatDay(cutOf(due))}`}
          />
        </CardContent>
      </SectionCard>
      <SectionCard
        caption={`Since the close of ${formatMonth(asOf)}`}
        label={subsectionLabel(monthEnd, 2)}
        title="What moved"
      >
        <CardContent className="grid gap-4">
          <Worksheet
            columns={["Retires at", `Liquid at ${String(moved.age)}`]}
            label="What moved the plan, worked out"
            rows={rows.map(({ row }) => row)}
          />
          {isLaid && (
            <Note>
              {`The close before ${month}'s was kept in a form this app cannot read, so its balances are carried on by today's plan, rates and your changes since included: without that close's plan, what they moved cannot be told apart.`}
            </Note>
          )}
          <Note>
            Each row is worked out after the ones above it. Liquid net worth
            leaves out the property, the vehicles and a pension its owner cannot
            yet draw, in today&apos;s money.
          </Note>
        </CardContent>
      </SectionCard>
      {closes !== null && since !== null && (
        <Suspense
          fallback={
            <LandedCard>
              <p className="text-sm text-muted-foreground">
                Drawing the futures…
              </p>
            </LandedCard>
          }
        >
          <LandedSince closes={closes} now={since.now} />
        </Suspense>
      )}
      <Trades month={due} moved={moved} targets={household.targets} />
    </Screen>
  );
}

// Where the actual sits among the bands a reading's futures carry the
// invested balances to, in the words of the five bands.
function bandOf({ actual, bands }: Landed): string {
  if (actual < bands.bottomTenth) {
    return "bottom tenth";
  }
  if (actual < bands.bottomQuarter) {
    return "bottom quarter";
  }
  if (actual <= bands.topQuarter) {
    return "middle half";
  }
  return actual <= bands.topTenth ? "top quarter" : "top tenth";
}

// What moved the plan since the close before the latest, with the month
// that close's balances were as of, and whether they alone were read,
// laid over the household now, as where that close was kept in a form
// this app cannot read whole; or why there is nothing to compare, said
// whole: that close was kept in a form this app cannot read, its
// balances among it, without the rules it breaks, since a version kept
// is history and nothing on the page can mend it; or it cannot be moved
// on now, in the rules' words; or the balances have been closed back
// onto its month or before it, as closing an earlier month again takes
// them, leaving no month between; or null where there is no such close.
function comparedOf(
  since: null | SinceClose,
  month: string,
): Answer<Compared> | null {
  if (since === null) {
    return null;
  }
  const { balances, before, now } = since;
  const closed = before.kind === "saved" ? before.value : balances;
  if (closed === null) {
    return refused(
      `The close before ${month}'s was kept in a form this app cannot read, so what moved shows from the next close.`,
    );
  }
  if (monthsBetween(closed.asOf, now.asOf) < 1) {
    return refused(
      `The balances are as of ${formatMonth(now.asOf)}, no later than the close before ${month}'s, so no month between them is left to compare.`,
    );
  }
  const answer = answerOf(() => ({
    asOf: closed.asOf,
    isLaid: before.kind === "refused",
    moved:
      before.kind === "saved"
        ? movedSince(before.value, now)
        : movedOver(closed, now),
  }));
  return answer.kind === "refused"
    ? refused(
        `The close before ${month}'s cannot be read now: ${answer.reason}.`,
      )
    : answer;
}

// The day a month's balances are cut on, as the meta line says it: "25
// September".
function cutDay(month: Month): string {
  return `${cutOf(month).slice(8)} ${monthName(month.month, "long")}`;
}

// What a group's row rests on: for the balances, how far they stand from
// what the month end expected, what was paid in, against what the plan
// paid where any of it is what Portfolio Performance says was, and what
// moved them, and how many were left as they stood; for the rates, the sources that
// changed, a tab of the assumptions screen at a time; for the household's
// own changes, the records that changed.
function detailOf(group: Group, moved: Moved): string {
  switch (group) {
    case "balances": {
      const { actual, expected, now, paid, planned, unchecked } =
        moved.balances;
      const apart = now - expected;
      return [
        `${formatGbp(Math.abs(apart))} ${apart < 0 ? "below" : "above"} what was expected`,
        actual.length > 0
          ? `${formatGbp(paid)} paid in against ${formatGbp(planned)} planned`
          : `${formatGbp(paid)} paid in`,
        `${formatGbp(moved.balances.moved)} moved`,
        ...(unchecked > 0
          ? [`${counted(unchecked, "balance")} left unchecked`]
          : []),
      ].join(" · ");
    }
    case "changes":
      return moved.changes.map((area) => areaNames[area]).join(", ");
    case "rates":
      return tabs
        .map((tab) => tab.filter((source) => moved.rates.includes(source)))
        .filter((changed) => changed.length > 0)
        .map((changed) =>
          changed.map((source) => sourceNames[source]).join(", "),
        )
        .join(" · ");
  }
}

// Since when a month has been due to close: the cut of the month after
// the latest point's, which is when it could first be closed; or, before
// any point is kept, that no month is closed yet.
function dueSince(latest: Month | undefined): string {
  return latest === undefined
    ? "No month closed yet"
    : `Due since ${cutDay(monthAfter(latest))}`;
}

// Why no close in the year before the latest gives a reading, in one
// sentence: none was closed, none checked an invested balance at both it
// and this close, or none can be read.
function emptyOf(passed: readonly Passed[], latest: Month): string {
  const year = `the year before ${formatMonth(latest)}`;
  if (passed.length === 0) {
    return `No month in ${year} was closed here, so this shows from the next close.`;
  }
  return passed.every(({ kind }) => kind === "unchecked")
    ? "No invested balance was checked at both this close and one in the year before it."
    : `No close in ${year} can be read, so this shows from the next close.`;
}

// A standing's figures: the age the plan's owner retires at, or never,
// and the liquid worth.
function figuresOf(standing: Standing, plan: Plan): readonly string[] {
  return [
    standing.retired === null ? "Never" : String(ageIn(standing.retired, plan)),
    formatGbp(standing.liquid),
  ];
}

// How long since the close a reading is against, as its verdict opens:
// the month, the year, or the months between.
function horizonOf(months: number): string {
  if (months === 1) {
    return "the month";
  }
  return months === 12 ? "the year" : `the ${String(months)} months`;
}

// What the invested balances are, with how many of them were left out.
function investedOf(left: number): string {
  const invested =
    "Invested balances are the accounts growing at the plan rate that were checked at both closes, as their statements give them.";
  if (left === 0) {
    return invested;
  }
  return left === 1
    ? `${invested} 1 of them was not checked at both and is left out.`
    : `${invested} ${String(left)} of them were not checked at both and are left out.`;
}

// A month as an ISO date writes it, its year and its month from one:
// "2026-08".
function keyOf({ month, year }: Month): string {
  return `${String(year)}-${String(month + 1).padStart(2, "0")}`;
}

// The card where the invested balances landed, under the caption given.
function LandedCard({
  caption,
  children,
}: {
  readonly caption?: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <SectionCard
      {...(caption !== undefined && { caption })}
      label={subsectionLabel(monthEnd, 3)}
      title="Where the invested balances landed"
    >
      <CardContent className="grid gap-4">{children}</CardContent>
    </SectionCard>
  );
}

// Where the invested balances landed among the futures of the oldest
// close in the year before the latest that gives a reading, once the
// closes given are read, against the household now: a verdict with the
// horizon in it, naming the close and the band of its futures the
// balances landed in; the balances against the middle future and the
// middle half and middle 80% of the run; what the balances are, and how
// many were left out; how paid in is counted, as Portfolio Performance
// gives it for the accounts it names, or as the plan paid it, saying so
// where the holdings were imported before this close; that the plan
// draws on the savings, where it does in any of the months; and each
// close passed over on the way, and why. Where no close gives a reading
// it says so in one sentence: none was closed in the year, none checked
// an invested balance at both it and this close, or none can be read,
// each passed over said after it.
function LandedSince({
  closes,
  now,
}: {
  readonly closes: Promise<readonly KeptClose[]>;
  readonly now: Kept;
}): JSX.Element {
  const { landed, passed } = landedSince(use(closes), now);
  const passedOver = passed.map((each) => (
    <Note key={keyOf(each.month)}>{passedOverOf(each)}</Note>
  ));
  if (landed === null) {
    return (
      <LandedCard>
        <p className="text-sm text-muted-foreground">
          {emptyOf(passed, now.asOf)}
        </p>
        {passed.some(({ kind }) => kind !== "unchecked") && passedOver}
      </LandedCard>
    );
  }
  const { actual, asOf, bands } = landed;
  return (
    <LandedCard caption={`Since the close of ${formatMonth(asOf)}`}>
      <p className="heading text-xl text-balance">
        {`Over ${horizonOf(landed.months)} since ${formatMonth(asOf)}'s close, the invested balances landed in the ${bandOf(landed)} of the futures its plan drew.`}
      </p>
      <p className="text-sm text-muted-foreground">
        {`${formatGbp(actual)} invested on ${formatDay(cutOf(now.asOf))}. The middle future of the ${formatCount(runLength)} came to ${banded.format(bands.middle)}; the middle half ran from ${banded.format(bands.bottomQuarter)} to ${banded.format(bands.topQuarter)}, and the middle 80% from ${banded.format(bands.bottomTenth)} to ${banded.format(bands.topTenth)}.`}
      </p>
      <Note>{investedOf(landed.left)}</Note>
      <Note>{paidInOf(landed, now)}</Note>
      {landed.isDrawing && (
        <Note>
          The plan draws on the savings in at least one of these months, but the
          futures here draw nothing, so the invested balances can land lower
          among them than the markets alone would put them.
        </Note>
      )}
      {passedOver}
    </LandedCard>
  );
}

// How a reading counts what was paid in: as Portfolio Performance gives
// it for the accounts it names, with how far that is from what the plan
// paid, or that it is the same to the pound, and as the plan paid it for
// the rest; or as the plan paid it, saying so where the holdings were
// imported before this close.
function paidInOf({ beyond, paidBy, read }: Landed, now: Kept): string {
  if (paidBy.length === 0) {
    const { targets } = now;
    return targets !== null && targets.importedOn < cutOf(now.asOf)
      ? "The futures count paid in as the plan paid it, since the holdings were imported before this close."
      : "The futures count paid in as the plan paid it.";
  }
  const side = beyond < 0 ? "less" : "more";
  const against =
    Math.round(beyond) === 0
      ? "the same as the plan paid"
      : `${formatGbp(Math.abs(beyond))} ${side} than the plan paid`;
  const rest =
    paidBy.length < read ? ", and as the plan paid for the rest" : "";
  return `The futures count paid in as Portfolio Performance gives it for ${listed.format(paidBy)}, ${against}${rest}.`;
}

// Why a close was passed over, as its note says it.
function passedOverOf({ kind, month }: Passed): string {
  return `${formatMonth(month)}'s close is passed over, since ${passedWhy[kind]}.`;
}

// The rows of what moved: the standing the month end expected, by the
// plan now where the balances alone were laid over it, a row a step with
// how far it moved the retirement and the liquid worth, and the standing
// now, each with how far it moved the liquid worth beside it, for the
// meta line to say which moved it most.
function rowsOf(
  { asOf, isLaid, moved }: Compared,
  plan: Plan,
): readonly { readonly liquid: number; readonly row: WorksheetRow }[] {
  let standing = moved.expected;
  const steps = moved.steps.map(({ groups, standing: next }) => {
    const from = standing;
    standing = next;
    const [first, ...rest] = groups.map((group) => groupNames[group]);
    return {
      liquid: next.liquid - from.liquid,
      row: {
        detail: groups.map((group) => detailOf(group, moved)).join(" · "),
        figures: [
          yearsMoved(from, next, plan),
          formatSignedGbp(next.liquid - from.liquid),
        ],
        label: [first, ...rest.map((name) => name.toLowerCase())].join(" and "),
      },
    };
  });
  return [
    {
      liquid: 0,
      row: {
        detail: `${formatMonth(asOf)}'s balances carried ${counted(moved.months, "month")} on as ${isLaid ? "today's plan expects" : "the plan expected"}`,
        figures: figuresOf(moved.expected, plan),
        label: "As the month end expected",
      },
    },
    ...steps,
    {
      liquid: 0,
      row: {
        figures: figuresOf(moved.now, plan),
        isResult: true,
        label: "Now",
      },
    },
  ];
}

// The title, which gives the answer: how far the close moved the
// retirement, where it did; and otherwise how far the balances closed
// from what the plan expected, or that they closed on it, with where
// the retirement still stands.
function titleOf(moved: Moved, month: string, plan: Plan): string {
  const { balances, expected, now } = moved;
  if (now.retired === null && expected.retired !== null) {
    return `${month}'s close put retirement out of reach`;
  }
  if (now.retired !== null && now.retired !== expected.retired) {
    const age = String(ageIn(now.retired, plan));
    return expected.retired === null
      ? `${month}'s close brought retirement within reach, at ${age}`
      : `${month}'s close brought retirement ${yearsMoved(expected, now, plan).toLowerCase()}, to ${age}`;
  }
  const still =
    now.retired === null
      ? "retirement still out of reach"
      : `retirement still at ${String(ageIn(now.retired, plan))}`;
  const apart = balances.now - balances.expected;
  if (apart === 0) {
    return `${month} went to plan; ${still}`;
  }
  const side = apart > 0 ? "ahead of" : "behind";
  return `${month} closed ${formatGbp(Math.abs(apart))} ${side} plan; ${still}`;
}

// The offer of the cash each securities account holds uninvested to the
// cogitator, an account at a time, as the amount to work trades out for
// in it, the month closed with it so the cogitator can say where it
// came from, or any amount chosen there, for the accounts the
// allocation lists, since the cogitator can keep its trades to no
// other; where the holdings were imported before their cash was read,
// or none of it could be, what the plan paid into the ISAs and the
// GIAs, in all; or, where they were imported before the month closed
// was cut, the word to import them first, with the file to import them
// from, and no amount, since trades worked out from them would be for
// holdings that have moved since. What the plan paid in is said
// whichever is offered, and the cash held where it was read.
function Trades({
  month,
  moved,
  targets,
}: {
  readonly month: Month;
  readonly moved: Moved;
  readonly targets: Kept["targets"];
}): JSX.Element {
  const fresh =
    targets === null || targets.importedOn < cutOf(month) ? null : targets;
  const held = fresh?.portfolios ?? [];
  const uninvested =
    held.length === 0 ? undefined : held.filter(({ cash }) => cash > 0);
  const listed = new Set(
    fresh?.categories.flatMap((category) =>
      (category.accounts ?? []).map(({ name }) => name),
    ),
  );
  const months =
    moved.months === 1
      ? `in ${formatMonth(month)}`
      : `in the ${String(moved.months)} months to ${formatMonth(month)}`;
  const paid = moved.invested === 0 ? "nothing" : formatGbp(moved.invested);
  const offers =
    uninvested === undefined
      ? moved.invested > 0 && (
          <Link
            className={buttonVariants({ size: "sm" })}
            href={`${cogitator.href}?amount=${String(moved.invested)}&from=${keyOf(month)}`}
          >
            {`Work out trades for ${formatGbp(moved.invested)}`}
          </Link>
        )
      : uninvested
          .filter(({ name }) => listed.has(name))
          .map(({ cash, name }) => (
            <Link
              className={buttonVariants({ size: "sm" })}
              href={`${cogitator.href}?${new URLSearchParams({ account: name, amount: String(cash), from: keyOf(month) }).toString()}`}
              key={name}
            >
              {`Work out trades for ${formatGbp(cash)} in ${name}`}
            </Link>
          ));
  return (
    <SectionCard
      actions={
        <>
          {fresh === null ? <PortfolioImport /> : offers}
          <Link
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={cogitator.href}
          >
            Choose an amount
          </Link>
        </>
      }
      label={subsectionLabel(monthEnd, 4)}
      title="Trades"
    >
      <CardContent className="grid gap-4">
        <p>{`The plan paid ${paid} into the ISAs and GIA ${months}.`}</p>
        {uninvested !== undefined && (
          <p>
            {uninvested.length === 0
              ? "Portfolio Performance holds no cash uninvested."
              : `Portfolio Performance holds ${uninvested.map(({ cash, name }) => [formatGbp(cash), name].join(" in ")).join(", ")} uninvested.`}
          </p>
        )}
        {fresh === null && (
          <Note>Import this month&apos;s holdings first.</Note>
        )}
      </CardContent>
    </SectionCard>
  );
}

// How far a step moved the retirement, in words rather than a signed
// figure: a year or more sooner or later, unchanged, into never or out
// of it to an age.
function yearsMoved(from: Standing, to: Standing, plan: Plan): string {
  if (from.retired === to.retired) {
    return "Unchanged";
  }
  if (to.retired === null) {
    return "Now never";
  }
  if (from.retired === null) {
    return `Now at ${String(ageIn(to.retired, plan))}`;
  }
  const years = to.retired - from.retired;
  const count = Math.abs(years);
  const span = count === 1 ? "A year" : `${String(count)} years`;
  return `${span} ${years < 0 ? "sooner" : "later"}`;
}
