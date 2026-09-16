import type { JSX, ReactNode } from "react";

import type { LineValues, Side } from "@/data/schedule";
import type { Plan } from "@/engine/projection";

import { SpanBar } from "@/components/app/atoms/span-bar";
import { MoneyField } from "@/components/app/molecules/money-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { YearField } from "@/components/app/molecules/year-field";
import { growthLabels } from "@/components/app/organisms/schedule-rows";
import { endYear } from "@/engine/projection";

// How a line ends: in a year typed into the field beneath the choice, or
// with the plan, so it has no last year.
type Ending = "fixed" | "open";

type Figure = "amount" | "firstYear" | "lastYear";

// A line as the fields read it: what every line holds, and the kind,
// whose choices are the schedule's own.
type Line<TKind extends string> = LineValues & { readonly kind: TKind };

interface LineFieldsProps<TKind extends string> {
  readonly amountLabel: string;
  readonly children?: ReactNode;
  readonly draft: Line<TKind>;
  readonly initial: Line<TKind>;
  readonly kinds: readonly Option<TKind>[];
  readonly namePlaceholder: string;
  readonly onAmend: (patch: Partial<LineValues>) => void;
  readonly onKindChange: (kind: TKind) => void;
  readonly plan: Plan;
  readonly side: Side;
}

interface Option<TValue extends string> {
  readonly label: string;
  readonly value: TValue;
}

const cadences = [
  { label: "A year", value: "year" },
  { label: "A month", value: "month" },
] as const;

const endings = [
  { label: "In a fixed year", value: "fixed" },
  { label: "With the plan", value: "open" },
] as const;

// The growth choices in the order the reference's dialog offers them,
// named as the rows name them.
const growths = optionsOf(growthLabels, [
  "inflation",
  "inflation-plus-1",
  "inflation-plus-2",
  "triple-lock",
  "nominal",
]);

// A draft the store would take: named, and not ending before it starts.
// The save button holds until it is one.
export function isSound(draft: LineValues): boolean {
  return (
    draft.name.trim() !== "" &&
    (draft.lastYear === null || draft.lastYear >= draft.firstYear)
  );
}

// The fields every line's dialog takes, in the shape of the reference's
// new-line dialog: a name and a category on the first row, the amount,
// its cadence and what it grows with on the second, whatever the
// schedule adds beneath, the first and last years, and the line's
// coverage of the plan's span, moving as the years are typed. The fields
// are uncontrolled and mount with the line as it opened, and report each
// change to the schedule, whose draft mirrors them. The last year is a
// choice before it is a year: the line ends in a fixed year, or with the
// plan, in which case it has none and the dialog says which year that
// is. A line that opened running to the end and is then given a year
// opens on its first year, which the field mounts showing.
export function LineFields<TKind extends string>({
  amountLabel,
  children,
  draft,
  initial,
  kinds,
  namePlaceholder,
  onAmend,
  onKindChange,
  plan,
  side,
}: LineFieldsProps<TKind>): JSX.Element {
  const end = endYear(plan);
  const fixedYear = initial.lastYear ?? initial.firstYear;

  function endIn(ending: Ending): void {
    onAmend({ lastYear: ending === "open" ? null : fixedYear });
  }

  // A figure field commits null when cleared, and a cleared figure is
  // left as it was rather than written as nothing.
  function figure(key: Figure): (value: null | number) => void {
    return (value) => {
      if (value !== null) {
        onAmend({ [key]: value });
      }
    };
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
        <TextField
          defaultValue={initial.name}
          label="Name"
          onValueChange={(name) => {
            onAmend({ name });
          }}
          placeholder={namePlaceholder}
        />
        <SelectField
          defaultValue={initial.kind}
          label="Category"
          onValueChange={onKindChange}
          options={kinds}
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <MoneyField
          defaultValue={initial.amount}
          hint="Today's money"
          label={amountLabel}
          onValueCommitted={figure("amount")}
        />
        <SelectField
          defaultValue={initial.cadence}
          label="Cadence"
          onValueChange={(cadence) => {
            onAmend({ cadence });
          }}
          options={cadences}
        />
        <SelectField
          defaultValue={initial.growth}
          label="Grows with"
          onValueChange={(growth) => {
            onAmend({ growth });
          }}
          options={growths}
        />
      </div>
      {children}
      <div className="grid grid-cols-2 items-start gap-4">
        <YearField
          defaultValue={initial.firstYear}
          hint={ageIn(draft.firstYear, plan)}
          label="First year"
          onValueCommitted={figure("firstYear")}
        />
        <div className="grid gap-4">
          <SelectField
            defaultValue={initial.lastYear === null ? "open" : "fixed"}
            label="Ends"
            onValueChange={endIn}
            options={endings}
          />
          {draft.lastYear === null ? (
            <span className="text-xs text-muted-foreground">
              {`Runs to ${String(end)}, the last year of the plan.`}
            </span>
          ) : (
            <YearField
              defaultValue={fixedYear}
              hint={ageIn(draft.lastYear, plan)}
              label="Last year"
              onValueCommitted={figure("lastYear")}
            />
          )}
        </div>
      </div>
      <div className="grid gap-2">
        <span className="label text-muted-foreground">
          {`Plan · ${String(plan.from)}–${String(end)}`}
        </span>
        <SpanBar
          firstYear={draft.firstYear}
          lastYear={draft.lastYear}
          plan={plan}
          side={side}
        />
      </div>
    </div>
  );
}

// The choices as the select takes them, in the order given, each named
// as its label says.
export function optionsOf<TValue extends string>(
  labels: Record<TValue, string>,
  order: readonly TValue[],
): readonly Option<TValue>[] {
  return order.map((value) => ({ label: labels[value], value }));
}

// The years a saved line runs, for the toast that reports it.
export function spanOf(line: LineValues): string {
  const last = line.lastYear === null ? "end of plan" : String(line.lastYear);
  return `${String(line.firstYear)}–${last}`;
}

// The age reached in a year, for the hint beneath a year field.
function ageIn(year: number, plan: Plan): string {
  return `Age ${String(year - plan.born)}`;
}
