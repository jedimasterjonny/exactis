import type { JSX } from "react";

import type { Month } from "@/data/schedule";
import type { LoanFigure } from "@/lib/figures";
import type { PlanMonth } from "@/lib/loans";

import { FieldRow } from "@/components/app/atoms/field-row";
import { MoneyField } from "@/components/app/molecules/money-field";
import { MonthField } from "@/components/app/molecules/month-field";
import { RateField } from "@/components/app/molecules/rate-field";
import { TermField } from "@/components/app/molecules/term-field";
import { YearField } from "@/components/app/molecules/year-field";
import { clearsIn, termTo } from "@/lib/loans";

// A loan as the fields read it: what is owed, and the three figures any
// two of which fix the third. An asset's draft carries these among its
// own, so it is handed down as it is.
export interface LoanDraft {
  readonly balance: number;
  readonly payment: number;
  readonly rate: number;
  readonly term: number;
}

// What the asset's fields call the loan's, since a mortgage is owed and
// paid off where finance is owed and left to run, and what they say
// when a figure has no answer: the balance field's label, the month
// field's, the term field's, the hint under a typed term, the error
// under a rate none fits, and the hint under a term the payment never
// reaches.
export interface LoanWords {
  readonly balance: string;
  readonly end: string;
  readonly never: string;
  readonly noRate: string;
  readonly term: string;
  readonly typed: string;
}

interface LoanFieldsProps {
  readonly draft: LoanDraft;
  readonly figure: null | number;
  readonly onAmend: (patch: Partial<LoanDraft>) => void;
  readonly plan: PlanMonth;
  readonly words: LoanWords;
  readonly worked: LoanFigure;
}

// The hint under the one figure the dialog works out rather than takes.
const workedHint = "Worked out from the other two";

// The fields every loan secured on an asset takes, in the slot the
// asset's own fields leave for them: what is owed and the rate on the
// first row, the monthly payment and the years on the second, and the
// month and the year those years run to on the third. All are shown by
// value: the balance because the rows come and go with the asset's
// status and have to come back showing what was typed, and the three
// figures because the dialog works one of them out from the other two,
// and which one changes hands as they are typed. The one worked out
// says so beneath itself. The two that can have no answer say so too: a
// rate none fits is an error, since the asset cannot be saved without
// one, and a term the payment never reaches is a hint, since a loan
// that never clears is paid to the end of the plan. What is owed and
// paid a month is held at nothing or above, since a sum below nothing
// is neither and the store would refuse it. The month and the year are
// the term read the other way, counted from the month the plan starts
// in: they show the month the term's last payment falls in, and one
// picked is reported as the term whose last payment falls in it, so a
// term can be typed as years or picked as a date and the two never
// disagree. The words are the caller's, since a house and a car say
// the same things of a loan in different terms.
export function LoanFields({
  draft,
  figure,
  onAmend,
  plan,
  words,
  worked,
}: LoanFieldsProps): JSX.Element {
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
    <>
      <FieldRow layout="pair">
        <MoneyField
          hint="What is owed today"
          label={words.balance}
          min={0}
          onValueCommitted={(balance) => {
            onAmend({ balance });
          }}
          value={draft.balance}
        />
        <RateField
          {...(worked === "rate" && figure === null && { error: words.noRate })}
          hint={worked === "rate" ? workedHint : "A year, compounding monthly"}
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
          hint={termHint(words, worked, figure)}
          label={words.term}
          onValueCommitted={(term) => {
            onAmend({ term });
          }}
          value={term}
        />
      </FieldRow>
      <FieldRow layout="pair">
        <MonthField
          hint={endHint(worked, figure)}
          label={words.end}
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

// What the term field says beneath itself: what a typed term is, in the
// caller's words; that it was worked out; or that the payment never
// reaches it, in the caller's words again.
function termHint(
  words: LoanWords,
  worked: LoanFigure,
  figure: null | number,
): string {
  if (worked !== "term") {
    return words.typed;
  }
  return figure === null ? words.never : workedHint;
}
