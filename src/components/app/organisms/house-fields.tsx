import type { JSX } from "react";

import type { HouseDraft, Status } from "@/data/houses";
import type { Month } from "@/data/schedule";
import type { LoanFigure } from "@/lib/figures";
import type { PlanMonth } from "@/lib/loans";

import { FieldRow } from "@/components/app/atoms/field-row";
import { MoneyField } from "@/components/app/molecules/money-field";
import { MonthField } from "@/components/app/molecules/month-field";
import { RateField } from "@/components/app/molecules/rate-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { TermField } from "@/components/app/molecules/term-field";
import { TextField } from "@/components/app/molecules/text-field";
import { YearField } from "@/components/app/molecules/year-field";
import { statuses } from "@/data/houses";
import { clearsIn, termTo } from "@/lib/loans";
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

// The hint under the one figure the dialog works out rather than takes.
const workedHint = "Worked out from the other two";

// The fields the house dialog takes: the name and the status on the first
// row, what the house is worth and the rate it grows at on the second,
// and for a mortgaged house what is owed and the rate on the third, the
// monthly payment and the years to pay off on the fourth, and the month
// and the year those years run to on the last. The first four are
// uncontrolled, mount with the house as it opened and report each
// change to the dialog, whose draft mirrors them. The loan's four are
// shown by value: the balance because the fields come and go with the
// status and have to come back showing what was typed, and the three
// figures because the dialog works one of them out from the other two,
// and which one changes hands as they are typed. The one worked out
// says so beneath itself. The two that can have no answer say so too: a
// rate none fits is an error, since the house cannot be saved without
// one, and a term the payment never reaches is a hint, since a loan that
// never clears is paid to the end of the plan. What is owed and paid a
// month is held at nothing or above, since a sum below nothing is
// neither and the store would refuse it. The month and the year are
// the term read the other way, counted from the month the plan is read
// in: they show the month the term's last payment falls in, and one
// picked is reported as the term whose last payment falls in it, so a
// term can be typed as years or picked as a date and the two
// never disagree. A house owned outright shows no loan fields at all.
export function HouseFields({
  draft,
  figure,
  initial,
  onAmend,
  plan,
  worked,
}: HouseFieldsProps): JSX.Element {
  function shown(field: LoanFigure): null | number {
    return worked === field ? figure : draft[field];
  }

  const term = shown("term");
  const end = term === null ? null : clearsIn(term, plan);

  // The end with its month or its year picked anew, and the other as
  // it stands, or the plan's own when there is no end to take it from,
  // reported as the term it is.
  function endIn(picked: Partial<Month>): void {
    const month = end?.month ?? plan.month;
    const year = end?.year ?? plan.from;
    onAmend({ term: termTo({ month, year, ...picked }, plan) });
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
        <>
          <FieldRow layout="pair">
            <MoneyField
              hint="What is owed today"
              label="Loan balance"
              min={0}
              onValueCommitted={(balance) => {
                onAmend({ balance });
              }}
              value={draft.balance}
            />
            <RateField
              {...(worked === "rate" &&
                figure === null && {
                  error: "No rate clears the balance over the term",
                })}
              hint={
                worked === "rate" ? workedHint : "A year, compounding monthly"
              }
              label="Rate"
              onValueCommitted={(rate) => {
                onAmend({ rate });
              }}
              value={shown("rate")}
            />
          </FieldRow>
          <FieldRow layout="pair">
            <MoneyField
              hint={worked === "payment" ? workedHint : "A month"}
              label="Monthly payment"
              min={0}
              onValueCommitted={(payment) => {
                onAmend({ payment });
              }}
              value={shown("payment")}
            />
            <TermField
              hint={termHint(worked, figure)}
              label="Years to pay off"
              onValueCommitted={(term) => {
                onAmend({ term });
              }}
              value={term}
            />
          </FieldRow>
          <FieldRow layout="pair">
            <MonthField
              hint={endHint(worked, figure)}
              label="Last payment"
              onValueChange={(month) => {
                endIn({ month });
              }}
              value={end?.month ?? null}
            />
            <YearField
              label="Year"
              min={plan.from}
              onValueCommitted={(year) => {
                endIn({ year });
              }}
              value={end?.year ?? null}
            />
          </FieldRow>
        </>
      )}
    </div>
  );
}

// What the month field says beneath itself: that it follows a
// worked-out term, that the payment never reaches the month, or that it
// is one with the years left, so picking it sets them.
function endHint(worked: LoanFigure, figure: null | number): string {
  if (worked !== "term") {
    return "One with the years left";
  }
  return figure === null
    ? "Never, at this payment"
    : "Worked out with the years left";
}

// What the term field says beneath itself: that it was worked out, that
// the payment never clears the loan, or what a typed term is.
function termHint(worked: LoanFigure, figure: null | number): string {
  if (worked !== "term") {
    return "Left to run";
  }
  return figure === null
    ? "Never clears at this payment, so the payments run to the end of the plan"
    : workedHint;
}
