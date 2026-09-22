import type { JSX } from "react";

import type { LoanWords } from "@/components/app/organisms/loan-fields";
import type { HouseDraft, Status } from "@/data/houses";
import type { LoanFigure } from "@/lib/figures";
import type { PlanMonth } from "@/lib/loans";

import { FieldRow } from "@/components/app/atoms/field-row";
import { MoneyField } from "@/components/app/molecules/money-field";
import { RateField } from "@/components/app/molecules/rate-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { LoanFields } from "@/components/app/organisms/loan-fields";
import { statuses } from "@/data/houses";
import { optionsOf } from "@/lib/options";

interface HouseFieldsProps {
  readonly draft: HouseDraft;
  readonly figure: null | number;
  readonly initial: HouseDraft;
  readonly onAmend: (patch: Partial<HouseDraft>) => void;
  readonly plan: PlanMonth;
  readonly worked: LoanFigure;
}

// What each status is called in the dialog's choice.
const statusLabels: Record<Status, string> = {
  mortgaged: "Mortgaged",
  outright: "Owned outright",
};

const statusOptions = optionsOf(statusLabels, statuses);

// What the house calls the loan's fields: a mortgage has a balance and
// years to pay off, left to run until its last payment, and one the
// payment never clears runs to the end of the plan.
const words: LoanWords = {
  balance: "Loan balance",
  end: "Last payment",
  never:
    "Never clears at this payment, so the payments run to the end of the plan",
  noRate: "No rate clears the balance over the term",
  term: "Years to pay off",
  typed: "Left to run",
};

// The fields the house dialog takes: the name and the status on the first
// row, what the house is worth and the rate it grows at on the second,
// and for a mortgaged house the loan fields every secured loan takes
// beneath them, in the house's words. The first four are uncontrolled,
// mount with the house as it opened and report each change to the
// dialog, whose draft mirrors them. A house owned outright shows no
// loan fields at all.
export function HouseFields({
  draft,
  figure,
  initial,
  onAmend,
  plan,
  worked,
}: HouseFieldsProps): JSX.Element {
  return (
    <div className="grid gap-4">
      <FieldRow layout="named">
        <TextField
          defaultValue={initial.name}
          label="Name"
          onValueChange={(name) => {
            onAmend({ name });
          }}
          placeholder="Home, flat, holiday let…"
        />
        <SelectField
          defaultValue={initial.status}
          label="Status"
          onValueChange={(status) => {
            onAmend({ status });
          }}
          options={statusOptions}
        />
      </FieldRow>
      <FieldRow layout="pair">
        <MoneyField
          defaultValue={initial.value}
          hint="What it would sell for today"
          label="Value"
          onValueCommitted={(value) => {
            onAmend({ value });
          }}
        />
        <RateField
          defaultValue={initial.growth}
          hint="Nominal, a year"
          label="Value growth"
          onValueCommitted={(growth) => {
            onAmend({ growth });
          }}
        />
      </FieldRow>
      {draft.status === "mortgaged" && (
        <LoanFields
          draft={draft}
          figure={figure}
          onAmend={onAmend}
          plan={plan}
          words={words}
          worked={worked}
        />
      )}
    </div>
  );
}
