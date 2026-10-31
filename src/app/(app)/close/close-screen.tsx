import type { JSX } from "react";

import { CalendarCheck, History } from "lucide-react";
import Link from "next/link";

import type { WorksheetRow } from "@/components/app/atoms/worksheet";
import type { Household, Kept } from "@/data/household";
import type { Plan } from "@/data/plan";
import type { Month } from "@/data/schedule";
import type { Answer } from "@/lib/answer";
import type { Area, Group, Moved, RateSource, Standing } from "@/lib/moved";
import type { SinceClose } from "@/store/household";

import { Ledger } from "@/components/app/atoms/ledger";
import { Note } from "@/components/app/atoms/note";
import { Worksheet } from "@/components/app/atoms/worksheet";
import { EmptyState } from "@/components/app/molecules/empty-state";
import { MonthEnd } from "@/components/app/organisms/month-end";
import { SectionCard } from "@/components/app/organisms/section-card";
import { Screen } from "@/components/app/templates/screen";
import { buttonVariants } from "@/components/kit/button";
import { CardContent } from "@/components/kit/card";
import { ageIn } from "@/data/plan";
import { isDue } from "@/data/progress";
import { laidOut } from "@/engine/projection";
import { answerOf, refused } from "@/lib/answer";
import { counted } from "@/lib/count";
import { formatGbp, formatSignedGbp } from "@/lib/money";
import {
  formatMonth,
  monthAfter,
  monthBefore,
  monthName,
  monthsBetween,
} from "@/lib/months";
import { movedSince } from "@/lib/moved";
import {
  assumptions,
  cogitator,
  monthEnd,
  sectionLabel,
  subsectionLabel,
} from "@/lib/nav";

// What each group of the walk is called as a row of what moved.
const groupNames: Record<Group, string> = {
  balances: "Balances against the plan",
  changes: "Your changes",
  rates: "Rates and their sources",
};

// What each source of the rates is called, as the assumptions screen
// names it.
const sourceNames: Record<RateSource, string> = {
  cma: "BlackRock CMA",
  curve: "BoE curve",
  deductions: "Fees and yield",
  glide: "Glide path",
  rates: "Rates typed",
  rateSet: "Set of rates",
  targets: "Target allocation",
};

// The sources each tab of the assumptions screen holds, in its order.
const tabs: readonly (readonly RateSource[])[] = [
  ["rateSet", "rates", "cma", "curve", "deductions"],
  ["targets"],
  ["glide"],
];

// What each record outside the rates is called, as its screen names it.
const areaNames: Record<Area, string> = {
  accounts: "Accounts",
  ages: "Plan end age",
  children: "Children",
  drawdown: "Drawdown",
  milestones: "Milestones",
  owners: "Owners",
  schedule: "Income & expenses",
};

interface CloseScreenProps {
  readonly household: Household;
  readonly isInScenario: boolean;
  readonly isUpdating: boolean;
  readonly month: Month;
  readonly since: null | SinceClose;
  readonly today: string;
}

// The month end: the last month that has ended closed onto the
// household, and once it is, what moved the plan since the close before.
// The title gives the answer. Until the month is closed, which its
// latest progress point says, the screen is the worksheet that closes
// it, opening on that month, and says since when a month has been due:
// the first of the month after the one after the latest point's, or
// that it is due where no point is kept. Once it is, the balances the
// close set against those it closed from, what moved the plan since the
// close before as the steps movedSince takes, and what the plan paid
// into the ISAs and the GIAs, offered to the cogitator; with the next
// close due and what mostly moved said in the meta line, and the
// balances to update in the header, which opens the same worksheet on
// the month closed, for a close to be made again or another month
// picked, with the way back. A household with no close before the
// latest, one the rules refuse now, or one whose balances have since
// been closed back onto that close's month or before it, has nothing to
// compare with, and says why. A month is closed in the household alone,
// so while a scenario is open the screen says to leave it, and nothing
// else, rather than lay the scenario's balances out to be refused. The
// month it is and the day are given rather than read, as the household
// and the close before the latest are.
export function CloseScreen({
  household,
  isInScenario,
  isUpdating,
  month: now,
  since,
  today,
}: CloseScreenProps): JSX.Element {
  const due = monthBefore(now);
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
  const isOpen = isDue(household.points, now);
  const month = monthName(due.month, "long");
  const next = `${monthName(now.month, "long")} closes from 1 ${monthName(monthAfter(now).month, "long")}`;
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
  const { before, moved } = compared.value;
  const { plan } = household;
  const rows = rowsOf(moved, before, plan);
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
        title={`Balances at the end of ${formatMonth(due)}`}
      >
        <CardContent>
          <Ledger
            steps={[
              {
                detail: `End of ${formatMonth(before.asOf)}`,
                figure: formatGbp(moved.balances.stood),
                label: "As the balances stood",
              },
              { figure: formatGbp(moved.balances.paid), label: "Paid in" },
              {
                detail: "Markets, interest and the unexpected",
                figure: formatGbp(moved.balances.moved),
                label: "Moved",
              },
            ]}
            total={formatGbp(moved.balances.now)}
            totalName={`As the balances stand at the end of ${formatMonth(due)}`}
          />
        </CardContent>
      </SectionCard>
      <SectionCard
        caption={`Since the close of ${formatMonth(before.asOf)}`}
        label={subsectionLabel(monthEnd, 2)}
        title="What moved"
      >
        <CardContent className="grid gap-4">
          <Worksheet
            columns={["Retires at", `Liquid at ${String(moved.age)}`]}
            label="What moved the plan, worked out"
            rows={rows.map(({ row }) => row)}
          />
          <Note>
            Each row is worked out after the ones above it. Liquid net worth
            leaves out the property, the vehicles and a pension its owner cannot
            yet draw, in today&apos;s money.
          </Note>
        </CardContent>
      </SectionCard>
      <Trades month={due} moved={moved} targets={household.targets} />
    </Screen>
  );
}

// What moved the plan since the close before the latest, with the
// household that close left; or why there is nothing to compare, said
// whole: that close cannot be read or moved on now, in the rules' words,
// or the balances have been closed back onto its month or before it, as
// closing an earlier month again takes them, leaving no month between;
// or null where there is no such close.
function comparedOf(
  since: null | SinceClose,
  month: string,
): Answer<{ readonly before: Kept; readonly moved: Moved }> | null {
  if (since === null) {
    return null;
  }
  const { before, now } = since;
  if (before.kind === "refused") {
    return refused(
      `The close before ${month}'s cannot be read now: ${before.reason}.`,
    );
  }
  if (monthsBetween(before.value.asOf, now.asOf) < 1) {
    return refused(
      `The balances are as of ${formatMonth(now.asOf)}, no later than the close before ${month}'s, so no month between them is left to compare.`,
    );
  }
  const answer = answerOf(() => ({
    before: before.value,
    moved: movedSince(before.value, now),
  }));
  return answer.kind === "refused"
    ? refused(
        `The close before ${month}'s cannot be read now: ${answer.reason}.`,
      )
    : answer;
}

// What a group's row rests on: for the balances, how far they stand from
// what the month end expected, what was paid in and what moved them, and
// how many were left as they stood; for the rates, the sources that
// changed, a tab of the assumptions screen at a time; for the household's
// own changes, the records that changed.
function detailOf(group: Group, moved: Moved): string {
  switch (group) {
    case "balances": {
      const { expected, now, paid, unchecked } = moved.balances;
      const apart = now - expected;
      return [
        `${formatGbp(Math.abs(apart))} ${apart < 0 ? "below" : "above"} what was expected`,
        `${formatGbp(paid)} paid in`,
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

// Since when a month has been due to close: the first of the month after
// the one after the latest point's, which is when the month after the
// latest point's could first be closed; or no more than that a month is
// due, before any point is kept.
function dueSince(latest: Month | undefined): string {
  return latest === undefined
    ? "Due"
    : `Due since 1 ${monthName(monthAfter(monthAfter(latest)).month, "long")}`;
}

// A standing's figures: the age the plan's owner retires at, or never,
// and the liquid worth.
function figuresOf(standing: Standing, plan: Plan): readonly string[] {
  return [
    standing.retired === null ? "Never" : String(ageIn(standing.retired, plan)),
    formatGbp(standing.liquid),
  ];
}

// The rows of what moved: the standing the month end expected, a row a
// step with how far it moved the retirement and the liquid worth, and
// the standing now, each with how far it moved the liquid worth beside
// it, for the meta line to say which moved it most.
function rowsOf(
  moved: Moved,
  before: Kept,
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
        detail: `${formatMonth(before.asOf)}'s balances carried ${counted(moved.months, "month")} on as the plan expected`,
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

// The offer of what the plan paid into the ISAs and the GIAs to the
// cogitator, or, where the holdings were imported before the month
// closed ended, the word to import them first.
function Trades({
  month,
  moved,
  targets,
}: {
  readonly month: Month;
  readonly moved: Moved;
  readonly targets: Kept["targets"];
}): JSX.Element {
  const ended = monthAfter(month);
  const isStale =
    targets === null ||
    targets.importedOn <
      `${String(ended.year)}-${String(ended.month + 1).padStart(2, "0")}-01`;
  const months =
    moved.months === 1
      ? `in ${formatMonth(month)}`
      : `in the ${String(moved.months)} months to ${formatMonth(month)}`;
  const paid = moved.invested === 0 ? "nothing" : formatGbp(moved.invested);
  return (
    <SectionCard
      actions={
        <>
          {isStale && (
            <Link
              className={buttonVariants({ size: "sm", variant: "outline" })}
              href={assumptions.href}
            >
              {`${assumptions.label} › Target allocation`}
            </Link>
          )}
          <Link
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={cogitator.href}
          >
            Choose an amount
          </Link>
        </>
      }
      label={subsectionLabel(monthEnd, 3)}
      title="Trades"
    >
      <CardContent className="grid gap-4">
        <p>{`The plan paid ${paid} into the ISAs and GIA ${months}.`}</p>
        {isStale && <Note>Import this month&apos;s holdings first.</Note>}
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
