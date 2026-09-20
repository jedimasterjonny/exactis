import type { JSX } from "react";

import type { Agreement, CarDraft } from "@/data/cars";
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
import { agreements } from "@/data/cars";
import { clearsIn, termTo } from "@/lib/loans";
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

// The hint under the one figure the dialog works out rather than takes.
const workedHint = "Worked out from the other two";

// The fields the car dialog takes: the name and the agreement on the
// first row, what the car is worth and the rate it loses value at on
// the second, and for a financed car what is owed and the rate on the
// third, the monthly payment and the years left on the fourth, the
// month and the year the years left run to on the fifth, and on a PCP
// the balloon on the last, under what becomes of it. The first four are
// uncontrolled, mount with the car as it opened and report each change
// to the dialog, whose draft mirrors them. The finance's five are shown
// by value: the balance and the balloon because the fields come and go
// with the agreement and have to come back showing what was typed, and
// the three figures because the dialog works one of them out from the
// other two, and which one changes hands as they are typed. The one
// worked out says so beneath itself. The two that can have no answer
// say so too: a rate none fits is an error, since the car cannot be
// saved without one, and a term the payment never reaches is a hint,
// since finance that never clears is paid to the end of the plan. The
// month and the year are the term read the other way, counted from the
// month the plan is read in: they show the month the term's last
// payment falls in, and one picked is reported as the term whose last
// payment falls in it, so a term can be typed as years or picked as a
// date and the two never disagree. A car owned outright shows no
// finance fields at all.
export function CarFields({
  clears,
  draft,
  figure,
  initial,
  onAmend,
  plan,
  worked,
}: CarFieldsProps): JSX.Element {
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
        <>
          <FieldRow layout="pair">
            <MoneyField
              hint="What is owed today"
              label="Balance owed"
              onValueCommitted={(balance) => {
                onAmend({ balance });
              }}
              value={draft.balance}
            />
            <RateField
              {...(worked === "rate" &&
                figure === null && {
                  error: "No rate reaches the balloon over the term",
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
              hint={termHint(draft.agreement, worked, figure)}
              label="Years left"
              onValueCommitted={(term) => {
                onAmend({ term });
              }}
              value={term}
            />
          </FieldRow>
          <FieldRow layout="pair">
            <MonthField
              hint={endHint(worked, figure)}
              label={
                draft.agreement === "pcp" ? "Agreement ends" : "Last payment"
              }
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
      {draft.agreement === "pcp" && (
        <FieldRow layout="pair">
          <MoneyField
            hint={balloonHint(clears)}
            label="Balloon"
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
// the payment never reaches the balloon or clears the loan, or what a
// typed term is left of.
function termHint(
  agreement: Agreement,
  worked: LoanFigure,
  figure: null | number,
): string {
  const isPcp = agreement === "pcp";
  if (worked !== "term") {
    return isPcp ? "On the agreement" : "To pay off";
  }
  if (figure !== null) {
    return workedHint;
  }
  return isPcp
    ? "Never reaches the balloon at this payment, so the payments run to the end of the plan"
    : "Never clears at this payment, so the payments run to the end of the plan";
}
