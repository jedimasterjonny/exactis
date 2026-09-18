import type { JSX } from "react";

import type { HouseDraft, Status } from "@/data/houses";
import type { LoanFigure } from "@/lib/figures";

import { FieldRow } from "@/components/app/atoms/field-row";
import { MoneyField } from "@/components/app/molecules/money-field";
import { RateField } from "@/components/app/molecules/rate-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { TermField } from "@/components/app/molecules/term-field";
import { TextField } from "@/components/app/molecules/text-field";
import { statuses } from "@/data/houses";
import { optionsOf } from "@/lib/options";

interface HouseFieldsProps {
  readonly draft: HouseDraft;
  readonly figure: null | number;
  readonly initial: HouseDraft;
  readonly onAmend: (patch: Partial<HouseDraft>) => void;
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
// and for a mortgaged house what is owed and the rate on the third, with
// the monthly payment and the years to pay off on the last. The first
// four are uncontrolled, mount with the house as it opened and report
// each change to the dialog, whose draft mirrors them. The loan's four
// are shown by value: the balance because the fields come and go with
// the status and have to come back showing what was typed, and the
// three figures because the dialog works one of them out from the other
// two, and which one changes hands as they are typed. The one worked out
// says so beneath itself. The two that can have no answer say so too: a
// rate none fits is an error, since the house cannot be saved without
// one, and a term the payment never reaches is a hint, since a loan that
// never clears is paid to the end of the plan. A house owned outright
// shows no loan fields at all.
export function HouseFields({
  draft,
  figure,
  initial,
  onAmend,
  worked,
}: HouseFieldsProps): JSX.Element {
  function shown(field: LoanFigure): null | number {
    return worked === field ? figure : draft[field];
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
              value={shown("term")}
            />
          </FieldRow>
        </>
      )}
    </div>
  );
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
