import type { JSX } from "react";

import type { LoanWords } from "@/components/app/organisms/loan-fields";
import type { HouseDraft, Status } from "@/data/houses";
import type { LoanFigure } from "@/lib/figures";
import type { PlanMonth } from "@/lib/loans";

import { FieldRow } from "@/components/app/atoms/field-row";
import {
  MoneyField,
  RateField,
  YearField,
} from "@/components/app/molecules/figure-field";
import { MonthField } from "@/components/app/molecules/month-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { LoanFields } from "@/components/app/organisms/loan-fields";
import { statuses } from "@/data/houses";
import { formatMonth } from "@/lib/months";
import { optionsOf } from "@/lib/options";

interface HouseFieldsProps {
  readonly draft: HouseDraft;
  readonly figure: null | number;
  readonly initial: HouseDraft;
  readonly onAmend: (patch: Partial<HouseDraft>) => void;
  readonly onWork: (worked: LoanFigure) => void;
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
};

// The fields the house dialog takes: the name and the status on the first
// row, what the house is worth and the rate it grows at on the second,
// the month and the year it was bought in and what it cost on the
// third, and for a mortgaged house the loan fields every secured loan
// takes beneath them, in the house's words. The year bought is held
// between the first year there is and the year the plan starts in,
// since a house is bought in a year that has begun and the store takes
// none before the first. The typed fields are uncontrolled, mount with
// the house as it opened and report each change to the dialog, whose
// draft mirrors them; the month is a choice by value, as every month
// field is, and shows the draft's. A house owned outright shows no
// loan fields at all.
export function HouseFields({
  draft,
  figure,
  initial,
  onAmend,
  onWork,
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
          hint={`What it would sell for in ${formatMonth({ month: plan.month, year: plan.from })}`}
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
      <FieldRow layout="triple">
        <MonthField
          label="Month bought"
          onValueChange={(month) => {
            onAmend({
              bought: {
                ...draft.bought,
                month: { ...draft.bought.month, month },
              },
            });
          }}
          value={draft.bought.month.month}
        />
        <YearField
          defaultValue={initial.bought.month.year}
          label="Year bought"
          max={plan.from}
          min={1}
          onValueCommitted={(year) => {
            onAmend({
              bought: {
                ...draft.bought,
                month: { ...draft.bought.month, year },
              },
            });
          }}
        />
        <MoneyField
          defaultValue={initial.bought.price}
          hint="What it cost"
          label="Bought for"
          min={0}
          onValueCommitted={(price) => {
            onAmend({ bought: { ...draft.bought, price } });
          }}
        />
      </FieldRow>
      {draft.status === "mortgaged" && (
        <LoanFields
          draft={draft}
          figure={figure}
          onAmend={onAmend}
          onWork={onWork}
          plan={plan}
          words={words}
          worked={worked}
        />
      )}
    </div>
  );
}
