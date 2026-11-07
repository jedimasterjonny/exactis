import type { JSX, ReactNode } from "react";

import { CalendarCheck, History } from "lucide-react";
import Link from "next/link";
import { Suspense, use } from "react";

import type { WorksheetRow } from "@/components/app/atoms/worksheet";
import type { TrackRow } from "@/components/app/organisms/track-record";
import type { Household, Kept } from "@/data/household";
import type { Plan } from "@/data/plan";
import type { KeptPoint } from "@/data/progress";
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
import {
  TrackRecord,
  TrackRecordPending,
} from "@/components/app/organisms/track-record";
import { Screen } from "@/components/app/templates/screen";
import { buttonVariants } from "@/components/kit/button";
import { CardContent } from "@/components/kit/card";
import { ageIn, risenBy } from "@/data/plan";
import { isDue } from "@/data/progress";
import { runLength } from "@/engine/futures";
import { laidOut } from "@/engine/projection";
import { answerOf, refused } from "@/lib/answer";
import { counted, formatCount } from "@/lib/count";
import { listed } from "@/lib/feeders";
import { bandOf, keptOf, landedSince } from "@/lib/landed";
import { formatGbp, formatSignedGbp, formatWholePercent } from "@/lib/money";
import {
  cutOf,
  formatDay,
  formatMonth,
  formatMonthShort,
  monthAfter,
  monthName,
  monthsBack,
  monthsBetween,
} from "@/lib/months";
import {
  areaNames,
  movedOver,
  movedSince,
  sourceNames,
  standingOf,
} from "@/lib/moved";
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

// A month of the track record, with the point kept for it, the latest's
// with the readings VII.iii reads now, or null for a month not closed.
interface Entry {
  readonly month: Month;
  readonly point: KeptPoint | null;
}

// Where a month falls in the track record: its first, its latest, or
// one between.
type Place = "between" | "first" | "latest";

// Where the plan stood at a month end, as a point keeps it.
type PointStanding = NonNullable<KeptPoint["standing"]>;

// A standing kept at a month end, with the month it was kept at and
// its liquid worth carried into today's money.
interface Stood {
  readonly liquid: number;
  readonly month: Month;
  readonly standing: PointStanding;
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
// the year before and the track record of that reading month by month,
// once the closes given are read, in a boundary of its own so the rest
// is drawn first, which holds the track record's height while it waits
// where a reading is kept; with the next close
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
            <>
              <LandedCard>
                <p className="text-sm text-muted-foreground">
                  Drawing the futures…
                </p>
              </LandedCard>
              {household.points.some(({ landed }) => landed !== undefined) && (
                <RecordCard>
                  <TrackRecordPending />
                </RecordCard>
              )}
            </>
          }
        >
          <LandedSince
            closes={closes}
            from={asOf}
            inflation={plan.inflation}
            now={since.now}
          />
        </Suspense>
      )}
      <Trades month={due} moved={moved} targets={household.targets} />
    </Screen>
  );
}

// What a reading says of where the invested balances landed: above a
// share of the futures, or above or below every one of them.
function aboveOf(share: number): string {
  if (share === 0) {
    return "Below every one of the futures";
  }
  return share === 1
    ? "Above every one of the futures"
    : `Above ${formatWholePercent(share)} of the futures`;
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

// The headline of the track record, which sets the standing kept at the
// close given, its liquid worth carried into today's money, against the
// standing now: how far retirement has moved since, into or out of
// reach, or that it is still where it was, with how far the liquid
// worth at the same age has moved, to the pound, where it is read at
// the same age.
function headlineOf(
  { liquid, month, standing }: Stood,
  now: PointStanding,
): string {
  const since = `Since ${formatMonth(month)}'s close, retirement`;
  if (standing.retires === now.retires) {
    const still =
      now.retires === null
        ? "is still out of reach"
        : `is still at ${String(now.retires)}`;
    if (standing.age !== now.age) {
      return `${since} ${still}.`;
    }
    const apart = Math.round(now.liquid - liquid);
    const worth = `${since} ${still}, and the liquid worth at ${String(now.age)} is`;
    if (apart === 0) {
      return `${worth} where it was.`;
    }
    const side = apart < 0 ? "lower" : "higher";
    return `${worth} ${formatGbp(Math.abs(apart))} ${side}.`;
  }
  if (now.retires === null) {
    return `${since} has moved out of reach.`;
  }
  return standing.retires === null
    ? `${since} has come within reach, at ${String(now.retires)}.`
    : `${since} has moved ${shiftOf(now.retires - standing.retires).toLowerCase()}, to ${String(now.retires)}.`;
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
// each passed over said after it. Beside it, from the same reading, the
// track record of the month ends before it, with what moved compared
// from the close given.
function LandedSince({
  closes,
  from,
  inflation,
  now,
}: {
  readonly closes: Promise<readonly KeptClose[]>;
  readonly from: Month;
  readonly inflation: number;
  readonly now: Kept;
}): JSX.Element {
  const { landed, passed } = landedSince(use(closes), now);
  const passedOver = passed.map((each) => (
    <Note key={keyOf(each.month)}>{passedOverOf(each)}</Note>
  ));
  const record = (
    <TrackRecordSince
      from={from}
      inflation={inflation}
      landed={landed}
      now={now}
    />
  );
  if (landed === null) {
    return (
      <>
        <LandedCard>
          <p className="text-sm text-muted-foreground">
            {emptyOf(passed, now.asOf)}
          </p>
          {passed.some(({ kind }) => kind !== "unchecked") && passedOver}
        </LandedCard>
        {record}
      </>
    );
  }
  const { actual, asOf, bands } = landed;
  return (
    <>
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
            The plan draws on the savings in at least one of these months, but
            the futures here draw nothing, so the invested balances can land
            lower among them than the markets alone would put them.
          </Note>
        )}
        {passedOver}
      </LandedCard>
      {record}
    </>
  );
}

// Why a month of the track record has no reading, as the crosshair and
// the table say it: the latest has none for the reason VII.iii gives, a
// month not closed has none, and one closed with none is where the
// record starts, at the first, or one none was kept for.
function missingOf({ point }: Entry, place: Place): string {
  if (place === "latest") {
    return "No reading this month, for the reason given above";
  }
  if (point === null) {
    return "Not closed, so no reading";
  }
  return place === "first"
    ? "Where the record starts"
    : "Closed, but no reading was kept";
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

// The card of the track record, under the caption given, held to the
// screen's width in one column as the fan's card is, since the plot's
// box widens to keep its ratio over its floor and a column sized to
// what it holds would widen with it past a phone's edge; and letting the
// crosshair run past its edge.
function RecordCard({
  caption,
  children,
}: {
  readonly caption?: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <SectionCard
      {...(caption !== undefined && { caption })}
      className="min-w-0 overflow-visible"
      label={subsectionLabel(monthEnd, 4)}
      title="Track record"
    >
      <CardContent className="grid grid-cols-1 gap-4">{children}</CardContent>
    </SectionCard>
  );
}

// The months of the track record: from the earliest point keeping a
// standing to the latest, each with its point, and each month between
// two points with none. The latest always keeps one, so the record is
// never empty.
function recordOf(points: readonly KeptPoint[]): readonly Entry[] {
  const kept = points.slice(
    points.findIndex(({ standing }) => standing !== undefined),
  );
  return kept.flatMap((point, index): Entry[] => {
    const before = kept[index - 1];
    if (before === undefined) {
      return [{ month: point.month, point }];
    }
    const steps = monthsBetween(before.month, point.month);
    return [
      ...Array.from({ length: steps - 1 }, (_, gap) => ({
        month: monthsBack(point.month, steps - 1 - gap),
        point: null,
      })),
      { month: point.month, point },
    ];
  });
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

// How far a retirement moved by the years given, in words: a year or
// more sooner or later.
function shiftOf(years: number): string {
  const count = Math.abs(years);
  const span = count === 1 ? "A year" : `${String(count)} years`;
  return `${span} ${years < 0 ? "sooner" : "later"}`;
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

// The track record of where the invested balances landed at each month
// end, the latest read now as VII.iii reads it and the rest as kept when
// the month after each closed, with where the plan stood; drawn once
// any month end gives a reading, and otherwise left out, since VII.iii
// says why there is none. With one reading it says that the record
// starts there and when it is charted from. With two or more it opens
// on how retirement has moved since the oldest standing kept in the
// year before the latest, where that is older than the close what moved
// compares from, so it never says what moved says, with what that
// counts; then the readings, charted; what a sound record looks like,
// which readings look back less than a year where one does, that a
// reading is kept as it stood, and that the plan draws on the savings
// where a reading drew; and every reading as a table, folded, newest
// first. Each liquid worth kept is carried into today's money at the
// plan's inflation, from the money of the month after its own.
function TrackRecordSince({
  from,
  inflation,
  landed,
  now,
}: {
  readonly from: Month;
  readonly inflation: number;
  readonly landed: Landed | null;
  readonly now: Kept;
}): JSX.Element | null {
  const live = {
    ...(landed !== null && { landed: keptOf(landed) }),
    standing: standingOf(now),
  };
  const entries = recordOf(
    now.points.map((point, index) =>
      index === now.points.length - 1 ? { ...point, ...live } : point,
    ),
  );
  const readings = entries.flatMap(({ point }) =>
    point?.landed === undefined ? [] : [point.landed],
  );
  if (readings.length === 0) {
    return null;
  }
  const { month: first } = entries.reduce((found) => found);
  const { month: latest } = entries.reduce((_, entry) => entry);
  const next = monthName(monthAfter(latest).month, "long");
  if (readings.length === 1) {
    return (
      <RecordCard>
        <p className="text-sm text-muted-foreground">
          {`The track record starts with this reading. Each month end keeps where the invested balances landed, and from ${next}'s close they are charted here, with how retirement has moved since ${formatMonth(first)}'s close.`}
        </p>
      </RecordCard>
    );
  }
  const carry = (month: Month, { liquid }: PointStanding): number =>
    liquid *
    risenBy(inflation, { from: month.year, month: month.month }, now.asOf);
  const standings = entries.flatMap(({ month, point }): Stood[] =>
    point?.standing === undefined
      ? []
      : [
          {
            liquid: carry(month, point.standing),
            month,
            standing: point.standing,
          },
        ],
  );
  const oldest = standings.find(
    ({ month }) => monthsBetween(month, latest) <= 12,
  );
  const isMoved = oldest !== undefined && monthsBetween(oldest.month, from) > 0;
  const placeOf = (index: number): Place => {
    if (index === entries.length - 1) {
      return "latest";
    }
    return index === 0 ? "first" : "between";
  };
  const views = entries.map((entry, index) =>
    viewOf(entry, placeOf(index), carry),
  );
  const isOneAge =
    new Set(standings.map(({ standing }) => standing.age)).size === 1;
  const moving =
    landed === null
      ? ""
      : ` ${monthName(latest.month, "long")}'s is the one above, and moves with its balances or a Portfolio Performance import until ${next} closes.`;
  return (
    <RecordCard caption="Middle half and middle 80% of the futures, with a reading each month end">
      {isMoved && (
        <div className="grid gap-1">
          <p className="heading text-xl text-balance">
            {headlineOf(oldest, live.standing)}
          </p>
          <p className="text-sm text-muted-foreground">
            This counts your own changes to the plan as well as the markets. The
            chart sets the markets apart: where the invested balances landed at
            each month end.
          </p>
        </div>
      )}
      <TrackRecord
        rows={views.map(({ row }) => row)}
        title={`Where the invested balances landed among the futures at each month end since ${formatMonth(first)}`}
      />
      <Note>
        Over the years, a plan whose rates hold up lands in each band about as
        often as the band is tall: half the time in the middle half, and one
        time in ten in the top tenth, as in the bottom. Each reading looks back
        up to a year, so neighbouring readings share most of their months, and a
        run of low ones is one lean stretch of the markets, not a lean month
        after another.
      </Note>
      {readings.some(({ months }) => months < 12) && (
        <Note>
          Hollow readings look back less than a year, as every one in the first
          year must, or where the close a year before was not kept or could not
          be read.
        </Note>
      )}
      <Note>
        {`Each reading is kept as it stood when the month after it closed, and is not read again.${moving} Earlier liquid worth is carried into today's money at the plan's inflation.`}
      </Note>
      {readings.some(({ isDrawing }) => isDrawing) && (
        <Note>
          The plan draws on the savings in some of these months, but the futures
          draw nothing, so readings over those months land lower among them than
          the markets alone would put them.
        </Note>
      )}
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          Every reading, as a table
        </summary>
        <div className="pt-3">
          <Worksheet
            columns={[
              "Landed in",
              "Retires at",
              isOneAge
                ? `Liquid at ${String(live.standing.age)}`
                : "Liquid at that age",
            ]}
            label="Every reading kept, newest first"
            rows={views
              .flatMap(({ table }) => (table === null ? [] : [table]))
              .toReversed()}
          />
        </div>
      </details>
    </RecordCard>
  );
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
      label={subsectionLabel(monthEnd, 5)}
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

// What a month of the track record says: in the crosshair, its reading,
// above a share of the futures in the band they named and over the
// months since the close it was read from, where it has one, or why it
// has none, and where the plan stood, retiring and liquid, where it kept
// that; and, for a month closed, the same as a row of the table, the
// band set first. The latest says that its reading is the one above.
// The liquid worth is carried into today's money as given.
function viewOf(
  entry: Entry,
  place: Place,
  carry: (month: Month, standing: PointStanding) => number,
): { readonly row: TrackRow; readonly table: null | WorksheetRow } {
  const { month, point } = entry;
  const standing = point?.standing;
  const stands =
    standing === undefined
      ? null
      : {
          liquid: formatGbp(carry(month, standing)),
          name: `Liquid at ${String(standing.age)}`,
          retires:
            standing.retires === null ? "Never" : String(standing.retires),
        };
  const figures =
    stands === null
      ? []
      : [
          ["Retires at", stands.retires] as const,
          [stands.name, stands.liquid] as const,
        ];
  const kept = stands === null ? ["—", "—"] : [stands.retires, stands.liquid];
  const label = formatMonthShort(month);
  const landed = point?.landed;
  if (landed === undefined) {
    const note = missingOf(entry, place);
    return {
      row: { figures, isShort: false, lines: [], month, note, share: null },
      table:
        point === null
          ? null
          : {
              detail: note,
              figures: [place === "first" ? "—" : "No reading", ...kept],
              label,
            },
    };
  }
  const close = monthsBack(month, landed.months);
  const above = aboveOf(landed.share);
  return {
    row: {
      figures,
      isShort: landed.months < 12,
      lines: [
        `${above}, in the ${landed.band}`,
        `Over ${horizonOf(landed.months)} since ${formatMonthShort(close)}'s close`,
      ],
      month,
      note: place === "latest" ? "This month's, as read above" : null,
      share: landed.share,
    },
    table: {
      detail: `${above}, over ${horizonOf(landed.months)} since ${formatMonth(close)}'s close`,
      figures: [
        `${landed.band.charAt(0).toUpperCase()}${landed.band.slice(1)}`,
        ...kept,
      ],
      label,
    },
  };
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
  return shiftOf(to.retired - from.retired);
}
