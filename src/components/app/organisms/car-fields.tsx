import type { JSX } from "react";

import type { LoanWords } from "@/components/app/organisms/loan-fields";
import type { Agreement, CarDraft } from "@/data/cars";
import type { LoanFigure } from "@/lib/figures";
import type { PlanMonth } from "@/lib/loans";

import { FieldRow } from "@/components/app/atoms/field-row";
import { MoneyField } from "@/components/app/molecules/money-field";
import { RateField } from "@/components/app/molecules/rate-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { LoanFields } from "@/components/app/organisms/loan-fields";
import { agreements } from "@/data/cars";
import { optionsOf } from "@/lib/options";

interface CarFieldsProps {
  readonly clears: null | number;
  readonly draft: CarDraft;
  readonly figure: null | number;
  readonly initial: CarDraft;
  readonly onAmend: (patch: Partial<CarDraft>) => void;
  readonly plan: PlanMonth;
  readonly worked: LoanFigure;
}

// What each agreement is called in the dialog's choice.
const agreementLabels: Record<Agreement, string> = {
  loan: "Loan",
  outright: "Owned outright",
  pcp: "PCP",
};

const agreementOptions = optionsOf(agreementLabels, agreements);

// The years the payments run in all, to a tenth as the term field shows
// them.
const years = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

// The fields the car dialog takes: the name and the agreement on the
// first row, what the car is worth and the rate it loses value at on
// the second, for a financed car the loan fields every secured loan
// takes beneath them, in the car's words, and on a PCP the balloon on
// the last row, under what becomes of it. The first four are
// uncontrolled, mount with the car as it opened and report each change
// to the dialog, whose draft mirrors them. The balloon is shown by
// value, since the field comes and goes with the agreement and has to
// come back showing what was typed, and is held at nothing or above,
// since a sum below nothing is no balloon and the store would refuse
// it. A car owned outright shows no finance fields at all.
export function CarFields({
  clears,
  draft,
  figure,
  initial,
  onAmend,
  plan,
  worked,
}: CarFieldsProps): JSX.Element {
  return (
    <div className="grid gap-4">
      <FieldRow layout="named">
        <TextField
          defaultValue={initial.name}
          label="Name"
          onValueChange={(name) => {
            onAmend({ name });
          }}
          placeholder="Golf, van, motorbike…"
        />
        <SelectField
          defaultValue={initial.agreement}
          label="Agreement"
          onValueChange={(agreement) => {
            onAmend({ agreement });
          }}
          options={agreementOptions}
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
          defaultValue={initial.depreciation}
          hint="Of its value, a year"
          label="Depreciation"
          onValueCommitted={(depreciation) => {
            onAmend({ depreciation });
          }}
        />
      </FieldRow>
      {draft.agreement !== "outright" && (
        <LoanFields
          draft={draft}
          figure={figure}
          onAmend={onAmend}
          plan={plan}
          words={wordsOf(draft.agreement)}
          worked={worked}
        />
      )}
      {draft.agreement === "pcp" && (
        <FieldRow layout="pair">
          <MoneyField
            hint={balloonHint(clears)}
            label="Balloon"
            min={0}
            onValueCommitted={(balloon) => {
              onAmend({ balloon });
            }}
            value={draft.balloon}
          />
        </FieldRow>
      )}
    </div>
  );
}

// What the balloon field says beneath itself: that the balloon is
// refinanced on the same terms when the agreement ends, and how long the
// payments then run in all, when they clear it.
function balloonHint(clears: null | number): string {
  const refinanced = "Refinanced on the same terms when the agreement ends";
  return clears === null
    ? refinanced
    : `${refinanced}, so the payments run ${years.format(clears)} years in all`;
}

// What the car calls the loan's fields: the finance is owed and has
// years left, on the agreement for a PCP and to pay off for a loan,
// and ends where the agreement does or with the last payment. A
// payment that never reaches a PCP's balloon, or never clears a loan,
// runs to the end of the plan.
function wordsOf(agreement: Agreement): LoanWords {
  const isPcp = agreement === "pcp";
  return {
    balance: "Balance owed",
    end: isPcp ? "Agreement ends" : "Last payment",
    never: isPcp
      ? "Never reaches the balloon at this payment, so the payments run to the end of the plan"
      : "Never clears at this payment, so the payments run to the end of the plan",
    noRate: "No rate reaches the balloon over the term",
    term: "Years left",
    typed: isPcp ? "On the agreement" : "To pay off",
  };
}
