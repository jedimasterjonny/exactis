import type { JSX } from "react";

import type { Plan } from "@/data/plan";
import type { Breaks } from "@/engine/futures";

import { Panel } from "@/components/app/atoms/panel";
import { AgeField } from "@/components/app/molecules/age-field";
import { SectionCard } from "@/components/app/organisms/section-card";
import { CardContent } from "@/components/kit/card";
import { retiresOn } from "@/data/milestones";
import { ageIn, endAge } from "@/data/plan";
import { deepestCut, isAgeSearched, runLength } from "@/engine/futures";
import { counted, formatCount } from "@/lib/count";
import { chance, subsectionLabel } from "@/lib/nav";

interface FuturesBreaksProps {
  readonly plan: Plan;
  readonly searched?: { readonly breaks: Breaks | undefined };
  readonly tried?: Tried;
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

// A retirement age tried on the card: the age, how many futures last
// retiring at it, unknown while they are counted, and what to call with
// an age committed.
interface Tried {
  readonly age: number;
  readonly lasted: number | undefined;
  readonly onAge: (age: number) => void;
}

// Where the plan breaks, under what the futures come to: one sentence
// saying at what retirement age, or on how much of the spending
// planned, nine in ten futures last, and the two as figures, each with
// what it holds as planned, as breaksIn finds them: the earliest age
// nine in ten futures last retiring at, and a hundred less the cut nine
// in ten last with. A plan isAgeSearched passes over has no age
// searched, and the spending says why. The figures wait until the
// search is done: before it they say it waits on the futures, and while
// it runs that it is searching them. Once it is done, where it hands
// back the brackets its search of the age left the futures in, which
// an age tried is counted off, the card has a retirement age to try
// beneath the figures, as AgeTried lays it out, where one is given, even
// where no age was found. Where another owner retires at an age of their
// own, the verdict, the age's figure, the spending's caption and the age
// tried name the plan's owner in their age phrases, as withOwner says it.
export function FuturesBreaks({
  plan,
  searched,
  tried,
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
        {breaks?.ages !== undefined && tried !== undefined && (
          <AgeTried plan={plan} tried={tried} />
        )}
      </CardContent>
    </SectionCard>
  );
}

// The age by which nine in ten futures last retiring, against the age
// the plan retires at, the age the plan opens at reading as now; or a
// dash where fewer last even working to the end. Where another owner
// retires at an age of their own, each names the plan's owner: "with"
// them before the age phrase, or "For" them before the age against the
// plan's.
function ageShown(age: null | number, plan: Plan): Shown {
  const label = "Retirement age";
  const named = withOwner(plan);
  if (age === null) {
    return {
      label,
      notes: [
        `Fewer than 9 in 10 last even ${named}working to ${String(endAge(plan))}`,
      ],
      value: "—",
    };
  }
  if (age === ageIn(plan.from, plan)) {
    return {
      label,
      notes: [`9 in 10 last ${named}retiring this year`],
      value: "Now",
      way: `${named}retiring this year`,
    };
  }
  const after = age - plan.retires;
  const side = after > 0 ? "after" : "before";
  const against =
    after === 0
      ? "as the plan retires"
      : `${counted(Math.abs(after), "year")} ${side} the plan retires`;
  const note = [
    ...ownerNamed(plan).map((name) => `For ${name}`),
    against,
    "spending as planned",
  ].join(", ");
  return {
    label,
    notes: [`${note.charAt(0).toUpperCase()}${note.slice(1)}`],
    unit: "yrs",
    value: String(age),
    way: `${named}retiring at ${String(age)}`,
  };
}

// A retirement age tried on the card alone, in a sunken panel beneath
// the figures, the box beside the sentence saying how many of the
// futures last retiring at it from the width of a small screen and
// above it below: at the plan's own age as the plan stands, and at any
// other spending as planned, as retiringAs says the age, naming the
// plan's owner where it does, with an ellipsis in place of the count
// while it is counted. The hint names the age the plan retires at, since
// the age tried changes nothing. A screen reader hears the sentence
// again once the count is in, and never while it is counted, so nothing
// ticks; and, the count in, the sentence shown is hidden from it, so
// browsing reads it once.
function AgeTried({
  plan,
  tried: { age, lasted, onAge },
}: {
  readonly plan: Plan;
  readonly tried: Tried;
}): JSX.Element {
  const opens = ageIn(plan.from, plan);
  const retiring = retiringAs(age, plan);
  const last = ` of ${formatCount(runLength)} futures last ${
    age === plan.retires
      ? `as the plan stands, ${retiring}.`
      : `${retiring}, spending as planned.`
  }`;
  const count = lasted === undefined ? undefined : formatCount(lasted);
  return (
    <Panel
      className="sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-x-6"
      variant="subtle"
    >
      <div className="w-52">
        <AgeField
          hasSlider={false}
          hint={`Tried here only; the plan retires ${
            plan.retires === opens ? "this year" : `at ${String(plan.retires)}`
          }`}
          label="Retirement age to try"
          max={endAge(plan)}
          min={opens}
          onValueCommitted={onAge}
          value={age}
        />
      </div>
      <p
        aria-hidden={count !== undefined}
        className="text-sm text-pretty text-muted-foreground"
      >
        <span className="figure text-foreground">{count ?? "…"}</span>
        {last}
      </p>
      <p aria-live="polite" className="sr-only">
        {count === undefined ? "" : `${count}${last}`}
      </p>
    </Panel>
  );
}

// The plan's owner's name, where another owner retires at an age of
// their own and so stays put while an age searched or tried moves the
// plan's owner and whoever retires with them; none otherwise.
function ownerNamed({ owners }: Plan): readonly string[] {
  return owners.slice(1).some(({ retirement }) => retirement !== "retirement")
    ? owners.slice(0, 1).map(({ name }) => name)
    : [];
}

// Retiring at the age given, as the age tried says it: the age the plan
// opens at as this year, and its last as working to it, with the plan's
// owner where another owner retires at an age of their own.
function retiringAs(age: number, plan: Plan): string {
  const named = withOwner(plan);
  if (age === ageIn(plan.from, plan)) {
    return `${named}retiring this year`;
  }
  return age === endAge(plan)
    ? `${named}working to ${String(age)}`
    : `${named}retiring at ${String(age)}`;
}

// The retirement the spending is read against, as its caption ends: at
// the plan's age, with the plan's owner where another owner retires at
// an age of their own, on its conditions, or nothing for one already
// begun.
function retiringOf(plan: Plan): string {
  if (isAgeSearched(plan)) {
    return `, ${withOwner(plan)}retiring at ${String(plan.retires)}`;
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
// among them where it is searched. Each age phrase names the plan's
// owner where another owner retires at an age of their own, so with a
// cut found and no age, it names no one.
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
    ? `Fewer than 9 in 10 futures last, even ${withOwner(plan)}working to ${String(endAge(plan))} or on half the spending planned.`
    : "Fewer than 9 in 10 futures last, even on half the spending planned.";
}

// A figure waiting on the search, beside nothing it rests on yet.
function waiting(label: string): Shown {
  return { label, notes: [], value: "…" };
}

// "with" the plan's owner, before an age phrase, where ownerNamed names
// them; nothing otherwise.
function withOwner(plan: Plan): string {
  return ownerNamed(plan)
    .map((name) => `with ${name} `)
    .join("");
}
