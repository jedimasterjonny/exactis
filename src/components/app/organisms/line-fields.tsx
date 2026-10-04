import type { JSX, ReactNode } from "react";

import type { Marker } from "@/data/milestones";
import type { Plan } from "@/data/plan";
import type { LineValues, Side, Tie } from "@/data/schedule";
import type { Option } from "@/lib/options";

import { FieldRow } from "@/components/app/atoms/field-row";
import { SpanBar } from "@/components/app/atoms/span-bar";
import { MoneyField, YearField } from "@/components/app/molecules/figure-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { yearsOf } from "@/data/milestones";
import { ageIn, endYear } from "@/data/plan";
import { cadenceOptions } from "@/lib/cadence";
import { counted } from "@/lib/count";
import { growthLabels } from "@/lib/lines";
import { optionsOf } from "@/lib/options";

// The category a schedule's lines are sorted into, where the schedule
// has one: the choices, which are the schedule's own, the one the line
// opened with, and where a choice goes.
interface Category<TKind extends string> {
  readonly initial: TKind;
  readonly kinds: readonly Option<TKind>[];
  readonly onChange: (kind: TKind) => void;
}

interface LineFieldsProps<TKind extends string> {
  readonly amountLabel: string;
  readonly category?: Category<TKind>;
  readonly children?: ReactNode;
  readonly draft: LineValues;
  readonly initial: LineValues;
  readonly milestones: readonly Marker[];
  readonly namePlaceholder: string;
  readonly onAmend: (patch: Partial<LineValues>) => void;
  readonly paid?:
    undefined | { readonly line: LineValues; readonly says: string };
  readonly plan: Plan;
  readonly side: Side;
}

const fixed = { label: "In a fixed year", value: "fixed" } as const;

// The growth choices in the order the reference's dialog offers them,
// named as the rows name them.
const growths = optionsOf(growthLabels, [
  "inflation",
  "inflation-plus-1",
  "inflation-plus-2",
  "nominal",
]);

// The fields every line's dialog takes, in the order they decide the
// line: a name on the first row, with a category beside it for a
// schedule that sorts its lines into one, since the category decides
// which fields follow; where the line starts and ends, and the line's
// coverage of the plan's span beneath them, moving as the years are
// typed, so when a line runs is settled and seen before what it pays;
// then the amount, its cadence and how it grows; and whatever the
// schedule adds beneath, a salary's parts. The fields report each change to the schedule, whose draft mirrors them. They
// mount with the line as it opened, save the two years and the years
// after, which show the draft's, since a choice moves them as well as
// the fields do. Each end is a choice before it is a year: a fixed
// year, typed into the field beneath the choice, or a milestone, in
// which case the line moves with it and the dialog says which year that
// is, and the last may run to the end of the plan instead, so it has
// none. The choices are worded as a row names its ties, a line running
// from one milestone until another, and the end of the plan names its
// last year. A
// milestone is the first year of what it marks, so a line starting at
// one starts in its year, and one ending at one runs to the year before
// it, or ends as many whole years after it as the field beneath the
// choice says, which stay as they are when another milestone is chosen
// and go when the end is no longer tied. An end moved off a milestone
// stays where the milestone had it, and a line that ran to the end and
// is given a year ends in its first year.
export function LineFields<TKind extends string>({
  amountLabel,
  category,
  children,
  draft,
  initial,
  milestones,
  namePlaceholder,
  onAmend,
  paid,
  plan,
  side,
}: LineFieldsProps<TKind>): JSX.Element {
  const end = endYear(plan);
  const tied = (word: "From" | "Until"): Option<string>[] =>
    milestones.map((marker) => ({
      label: `${word} ${marker.name} · ${String(marker.year)}`,
      value: choiceOf(marker.id),
    }));
  const open = { label: `To the end · ${String(end)}`, value: "open" };
  const from = milestones.find(({ id }) => id === draft.startsAt);
  const until = milestones.find(({ id }) => id === draft.endsAt);
  const drawn = paid?.line ?? draft;

  function startAt(starting: string): void {
    const marker = milestones.find(({ id }) => choiceOf(id) === starting);
    onAmend(
      marker === undefined
        ? { startsAt: null }
        : { firstYear: marker.year, startsAt: marker.id },
    );
  }

  function endAt(ending: string): void {
    const marker = milestones.find(({ id }) => choiceOf(id) === ending);
    if (marker !== undefined) {
      onAmend({
        endsAt: marker.id,
        lastMonth: null,
        lastYear: marker.year - 1 + draft.endsAfter,
      });
      return;
    }
    onAmend({
      endsAfter: 0,
      endsAt: null,
      lastYear: ending === "open" ? null : (draft.lastYear ?? draft.firstYear),
    });
  }

  const name = (
    <TextField
      defaultValue={initial.name}
      label="Name"
      onValueChange={(typed) => {
        onAmend({ name: typed });
      }}
      placeholder={namePlaceholder}
    />
  );

  return (
    <div className="grid gap-4">
      {category === undefined ? (
        name
      ) : (
        <FieldRow layout="named">
          {name}
          <SelectField
            defaultValue={category.initial}
            label="Category"
            onValueChange={category.onChange}
            options={category.kinds}
          />
        </FieldRow>
      )}
      <FieldRow layout="pair-top">
        <div className="grid gap-4">
          <SelectField
            defaultValue={
              initial.startsAt === null ? "fixed" : choiceOf(initial.startsAt)
            }
            label="Starts"
            onValueChange={startAt}
            options={[fixed, ...tied("From")]}
          />
          {from === undefined ? (
            <YearField
              hint={ageHint(draft.firstYear, plan)}
              label="First year"
              onValueCommitted={(firstYear) => {
                onAmend({ firstYear });
              }}
              value={draft.firstYear}
            />
          ) : (
            <Beneath>
              {`Starts in ${String(from.year)}, the year of ${from.name}.`}
            </Beneath>
          )}
        </div>
        <div className="grid gap-4">
          <SelectField
            defaultValue={endingOf(initial)}
            label="Ends"
            onValueChange={endAt}
            options={[fixed, ...tied("Until"), open]}
          />
          {until !== undefined && (
            <YearField
              hint={runsTo(until, draft.endsAfter)}
              label="Years after"
              min={0}
              onValueCommitted={(endsAfter) => {
                onAmend({ endsAfter, lastYear: until.year - 1 + endsAfter });
              }}
              value={draft.endsAfter}
            />
          )}
          {until === undefined &&
            draft.lastYear === null &&
            paid === undefined && (
              <Beneath>
                {`Runs to ${String(end)}, the last year of the plan.`}
              </Beneath>
            )}
          {until === undefined && draft.lastYear !== null && (
            <YearField
              hint={ageHint(draft.lastYear, plan)}
              label="Last year"
              onValueCommitted={(lastYear) => {
                onAmend({ lastYear });
              }}
              value={draft.lastYear}
            />
          )}
          {paid !== undefined && <Beneath>{paid.says}</Beneath>}
        </div>
      </FieldRow>
      <div className="grid gap-2">
        <span className="label text-muted-foreground">
          {`Plan · ${String(plan.from)}–${String(end)}`}
        </span>
        <SpanBar
          endsAt={drawn.endsAt}
          firstYear={drawn.firstYear}
          lastMonth={drawn.lastMonth}
          lastYear={drawn.lastYear}
          marks={yearsOf(milestones)}
          plan={plan}
          side={side}
          startsAt={drawn.startsAt}
        />
      </div>
      <FieldRow layout="triple">
        <MoneyField
          defaultValue={initial.amount}
          hint="Today's money"
          label={amountLabel}
          onValueCommitted={(amount) => {
            onAmend({ amount });
          }}
        />
        <SelectField
          defaultValue={initial.cadence}
          label="Cadence"
          onValueChange={(cadence) => {
            onAmend({ cadence });
          }}
          options={cadenceOptions}
        />
        <SelectField
          defaultValue={initial.growth}
          label="Growth"
          onValueChange={(growth) => {
            onAmend({ growth });
          }}
          options={growths}
        />
      </FieldRow>
      {children}
    </div>
  );
}

// The age reached in a year, for the hint beneath a year field.
function ageHint(year: number, plan: Plan): string {
  return `Age ${String(ageIn(year, plan))}`;
}

// What stands beneath an end's choice in place of its year's field, when
// the year is the milestone's or the plan's rather than typed.
function Beneath({ children }: { readonly children: string }): JSX.Element {
  return <span className="text-xs text-muted-foreground">{children}</span>;
}

// The choice a milestone is offered as, where either end of a line
// falls being a word: "fixed", in a year typed into the field beneath
// the choice; "open", for the last, with the plan, so it has no last
// year; or a milestone, retirement by its own id and one the household
// lists by its id written out.
function choiceOf(tie: Tie): string {
  return String(tie);
}

// How a line opens ending: at the milestone it is tied to, in its last
// year, or with the plan.
function endingOf(line: LineValues): string {
  if (line.endsAt !== null) {
    return choiceOf(line.endsAt);
  }
  return line.lastYear === null ? "open" : "fixed";
}

// Where a line ending the years given after a milestone runs to: the
// year before it for none, "Runs to 2048, the year before Retirement",
// or that many years on, "Runs to 2051, ending 3 years after
// Retirement".
function runsTo(until: Marker, after: number): string {
  const last = String(until.year - 1 + after);
  return after === 0
    ? `Runs to ${last}, the year before ${until.name}.`
    : `Runs to ${last}, ending ${counted(after, "year")} after ${until.name}.`;
}
