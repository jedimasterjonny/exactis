import type { JSX } from "react";

import type { Plan } from "@/data/plan";
import type { Breaks } from "@/engine/futures";

import { SectionCard } from "@/components/app/organisms/section-card";
import { CardContent } from "@/components/kit/card";
import { retiresOn } from "@/data/milestones";
import { ageIn, endAge } from "@/data/plan";
import { deepestCut, isAgeSearched } from "@/engine/futures";
import { counted } from "@/lib/count";
import { chance, subsectionLabel } from "@/lib/nav";

interface FuturesBreaksProps {
  readonly plan: Plan;
  readonly searched?: { readonly breaks: Breaks | undefined };
}

// A figure the card shows: what it is, the figure and its unit where it
// has one, what it rests on, a line or two, and how the verdict says it
// where nine in ten last at it.
interface Shown {
  readonly label: string;
  readonly notes: readonly string[];
  readonly unit?: string;
  readonly value: string;
  readonly way?: string;
}

// Where the plan breaks, under what the futures come to: one sentence
// saying at what retirement age, or on how much of the spending
// planned, nine in ten futures last, and the two as figures, each with
// what it holds as planned, as breaksIn finds them: the earliest age
// nine in ten futures last retiring at, and a hundred less the cut nine
// in ten last with. A plan isAgeSearched passes over has no age
// searched, and the spending says why. The figures wait until the
// search is done: before it they say it waits on the futures, and while
// it runs that it is searching them.
export function FuturesBreaks({
  plan,
  searched,
}: FuturesBreaksProps): JSX.Element {
  const isAge = isAgeSearched(plan);
  const breaks = searched?.breaks;
  const isDone = breaks !== undefined;
  const age = breaks?.age ?? null;
  const cut = breaks?.cut ?? null;
  const spending = isDone ? spendingShown(cut, plan) : waiting("Spending");
  const figures = [
    ...(isAge
      ? [isDone ? ageShown(age, plan) : waiting("Retirement age")]
      : []),
    { ...spending, notes: [...spending.notes, ...unsearchedOf(plan)] },
  ];
  return (
    <SectionCard
      label={subsectionLabel(chance, 1)}
      title="Where the plan breaks"
    >
      <CardContent className="grid gap-6">
        {isDone ? (
          <p className="heading text-xl text-balance">
            {verdictOf(figures, isAge, plan)}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {searched === undefined
              ? "The search starts once the futures are drawn."
              : "Searching the futures…"}
          </p>
        )}
        <dl className="grid gap-6 sm:grid-cols-2">
          {figures.map(({ label, notes, unit, value }) => (
            <div className="grid content-start gap-1.5" key={label}>
              <dt className="label text-muted-foreground">{label}</dt>
              <dd className="flex items-baseline gap-1.5">
                <span className="figure text-3xl font-medium tracking-tight">
                  {value}
                </span>
                {unit !== undefined && (
                  <>
                    {" "}
                    <span className="figure text-base text-muted-foreground">
                      {unit}
                    </span>
                  </>
                )}
              </dd>
              {notes.map((note) => (
                <dd
                  className="text-sm text-pretty text-muted-foreground"
                  key={note}
                >
                  {note}
                </dd>
              ))}
            </div>
          ))}
        </dl>
      </CardContent>
    </SectionCard>
  );
}

// The age by which nine in ten futures last retiring, against the age
// the plan retires at, the age the plan opens at reading as now; or a
// dash where fewer last even working to the end.
function ageShown(age: null | number, plan: Plan): Shown {
  const label = "Retirement age";
  if (age === null) {
    return {
      label,
      notes: [
        `Fewer than 9 in 10 last even working to ${String(endAge(plan))}`,
      ],
      value: "—",
    };
  }
  if (age === ageIn(plan.from, plan)) {
    return {
      label,
      notes: ["9 in 10 last retiring this year"],
      value: "Now",
      way: "retiring this year",
    };
  }
  const after = age - plan.retires;
  const side = after > 0 ? "after" : "before";
  const against =
    after === 0
      ? "As the plan retires"
      : `${counted(Math.abs(after), "year")} ${side} the plan retires`;
  return {
    label,
    notes: [`${against}, spending as planned`],
    unit: "yrs",
    value: String(age),
    way: `retiring at ${String(age)}`,
  };
}

// The retirement the spending is read against, as its caption ends: at
// the plan's age, on its conditions, or nothing for one already begun.
function retiringOf(plan: Plan): string {
  if (isAgeSearched(plan)) {
    return `, retiring at ${String(plan.retires)}`;
  }
  return retiresOn(plan) === undefined ? "" : ", retiring on its conditions";
}

// The share of the spending planned nine in ten futures last on, as far
// either way as the cut is searched, against the retirement planned.
function spendingShown(cut: null | number, plan: Plan): Shown {
  if (cut === null) {
    return {
      label: "Spending",
      notes: ["Fewer than 9 in 10 last even at half the spending"],
      value: `Under ${String(100 - deepestCut)}%`,
    };
  }
  if (cut === -deepestCut) {
    return {
      label: "Spending",
      notes: ["9 in 10 last even on half as much again"],
      value: `${String(100 + deepestCut)}%+`,
      way: `on ${String(100 + deepestCut)}% or more of the spending planned`,
    };
  }
  return {
    label: "Spending",
    notes: [`Of the spending planned, from this year on${retiringOf(plan)}`],
    value: `${String(100 - cut)}%`,
    way: `on ${String(100 - cut)}% of the spending planned`,
  };
}

// Why the plan has no age searched, as a line beneath the spending,
// where it has none: retirement on conditions, or one already begun.
function unsearchedOf(plan: Plan): readonly string[] {
  if (isAgeSearched(plan)) {
    return [];
  }
  const why =
    retiresOn(plan) === undefined
      ? "Retirement has begun"
      : "Retirement waits on its conditions";
  return [`${why}, so only the spending is searched.`];
}

// The sentence the card opens with once the run is searched: at what
// age, and on how much of the spending, nine in ten futures last, each
// as its figure says it, left out where none was found, and where
// neither was, that fewer last even at the ends searched, the age's
// among them where it is searched.
function verdictOf(
  figures: readonly Shown[],
  isAge: boolean,
  plan: Plan,
): string {
  const ways = figures.flatMap(({ way }) => way ?? []);
  if (ways.length > 0) {
    return `9 in 10 futures last ${ways.join(", or ")}.`;
  }
  return isAge
    ? `Fewer than 9 in 10 futures last, even working to ${String(endAge(plan))} or on half the spending planned.`
    : "Fewer than 9 in 10 futures last, even on half the spending planned.";
}

// A figure waiting on the search, beside nothing it rests on yet.
function waiting(label: string): Shown {
  return { label, notes: [], value: "…" };
}
