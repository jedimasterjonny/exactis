import type { JSX, ReactNode } from "react";

import type { LineValues, Side } from "@/data/schedule";
import type { Plan } from "@/engine/projection";
import type { Option } from "@/lib/options";

import { FieldRow } from "@/components/app/atoms/field-row";
import { SpanBar } from "@/components/app/atoms/span-bar";
import { MoneyField } from "@/components/app/molecules/money-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { YearField } from "@/components/app/molecules/year-field";
import { endYear } from "@/engine/projection";
import { cadenceOptions } from "@/lib/cadence";
import { growthLabels } from "@/lib/lines";
import { optionsOf } from "@/lib/options";

// How a line ends: in a year typed into the field beneath the choice, or
// with the plan, so it has no last year.
type Ending = "fixed" | "open";

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

  return (
    <div className="grid gap-4">
      <FieldRow layout="named">
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
      </FieldRow>
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
          label="Grows with"
          onValueChange={(growth) => {
            onAmend({ growth });
          }}
          options={growths}
        />
      </FieldRow>
      {children}
      <FieldRow layout="pair-top">
        <YearField
          defaultValue={initial.firstYear}
          hint={ageIn(draft.firstYear, plan)}
          label="First year"
          onValueCommitted={(firstYear) => {
            onAmend({ firstYear });
          }}
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
              onValueCommitted={(lastYear) => {
                onAmend({ lastYear });
              }}
            />
          )}
        </div>
      </FieldRow>
      <div className="grid gap-2">
        <span className="label text-muted-foreground">
          {`Plan · ${String(plan.from)}–${String(end)}`}
        </span>
        <SpanBar
          firstYear={draft.firstYear}
          lastMonth={draft.lastMonth}
          lastYear={draft.lastYear}
          plan={plan}
          side={side}
        />
      </div>
    </div>
  );
}

// The age reached in a year, for the hint beneath a year field.
function ageIn(year: number, plan: Plan): string {
  return `Age ${String(year - plan.born)}`;
}
