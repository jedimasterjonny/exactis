import type { JSX } from "react";

import { useState } from "react";

import type { Month } from "@/data/schedule";
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
import { counted } from "@/lib/count";
import { clearsIn, termTo } from "@/lib/loans";
import { formatMonth } from "@/lib/months";

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
// field's, the hint under an end the payment never reaches, and the
// error under a rate none fits.
export interface LoanWords {
  readonly balance: string;
  readonly end: string;
  readonly never: string;
  readonly noRate: string;
}

interface LoanFieldsProps {
  readonly draft: LoanDraft;
  readonly figure: null | number;
  readonly onAmend: (patch: Partial<LoanDraft>) => void;
  readonly onWork: (worked: LoanFigure) => void;
  readonly plan: PlanMonth;
  readonly words: LoanWords;
  readonly worked: LoanFigure;
}

// The hint under the one figure the dialog works out rather than takes.
const workedHint = "Worked out from the other two";

// The three figures any two of which fix the third, as the choice of
// which is worked out offers them.
const workings = [
  { label: "The monthly payment", value: "payment" },
  { label: "The rate", value: "rate" },
  { label: "When it ends", value: "term" },
] as const;

// The fields every loan secured on an asset takes, in the slot the
// asset's own fields leave for them: what is owed and which figure is
// worked out on the first row, the monthly payment and the rate on the
// second, and the month and the year the last payment falls in on the
// third. Which figure is worked out is chosen, rather than taken from
// whichever two were typed last, so the one that moves as the others
// are typed is the one the choice names: it is shown read-only and says
// so beneath itself, and the other two are typed. The end is the term
// read as a date, counted from the month the plan starts in, and one
// picked is reported as the term whose last payment falls in it, the
// years it comes to said beneath the year, to a tenth, since one worked
// out seldom lands on a whole one. Where the payment never reaches an
// end, the year says so in the caller's words, since the month is held
// while the end is worked out and a held select is passed over by the
// keyboard, where the year's read-only figure is not. All are shown by value: the
// balance because the rows come and go with the asset's status and
// have to come back showing what was typed, and the three figures
// because one of them is worked out from the other two. The two that
// can have no answer say so: a rate none fits is an error, since the
// asset cannot be saved without one, and an end the payment never
// reaches is a hint, since a loan that never clears is paid to the end
// of the plan. What is owed and paid a month is held at nothing or
// above, since a sum below nothing is neither and the store would
// refuse it. The words are the caller's, since a house and a car say
// the same things of a loan in different terms.
export function LoanFields({
  draft,
  figure,
  onAmend,
  onWork,
  plan,
  words,
  worked,
}: LoanFieldsProps): JSX.Element {
  // The choice mounts on the figure the fields opened working out and is
  // the select's own from then on, as the other selects of a dialog are.
  const [opened] = useState(worked);

  function shown(field: LoanFigure): null | number {
    return worked === field ? figure : draft[field];
  }

  const term = shown("term");
  const end = term === null ? null : clearsIn(term, plan);

  // The end with its month or its year picked anew, and the other as
  // the typed term has it, reported as the term it is. Only an end the
  // dialog does not work out can be picked, so it is always the draft's
  // own term's.
  function endIn(picked: Partial<Month>): void {
    onAmend({
      term: termTo({ ...clearsIn(draft.term, plan), ...picked }, plan),
    });
  }

  return (
    <>
      <FieldRow layout="pair">
        <MoneyField
          hint={`What is owed in ${formatMonth({ month: plan.month, year: plan.from })}`}
          label={words.balance}
          min={0}
          onValueCommitted={(balance) => {
            onAmend({ balance });
          }}
          value={draft.balance}
        />
        <SelectField
          defaultValue={opened}
          hint="From the other two"
          label="Work out"
          onValueChange={onWork}
          options={workings}
        />
      </FieldRow>
      <FieldRow layout="pair">
        <MoneyField
          hint={worked === "payment" ? workedHint : "A month"}
          isReadOnly={worked === "payment"}
          label="Monthly payment"
          min={0}
          onValueCommitted={(payment) => {
            onAmend({ payment });
          }}
          value={shown("payment")}
        />
        <RateField
          {...(worked === "rate" && figure === null && { error: words.noRate })}
          hint={worked === "rate" ? workedHint : "A year, compounding monthly"}
          isReadOnly={worked === "rate"}
          label="Rate"
          onValueCommitted={(rate) => {
            onAmend({ rate });
          }}
          value={shown("rate")}
        />
      </FieldRow>
      <FieldRow layout="pair">
        <MonthField
          hint={endHint(worked, figure)}
          isDisabled={worked === "term"}
          label={words.end}
          onValueChange={(month) => {
            endIn({ month });
          }}
          value={end?.month ?? null}
        />
        <YearField
          hint={
            term === null
              ? words.never
              : `${counted(Math.round(term * 10) / 10, "year")} left`
          }
          isReadOnly={worked === "term"}
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

// What the month field says beneath itself: that the end was worked
// out, that the payment never reaches one, or what it is when it is
// picked.
function endHint(worked: LoanFigure, figure: null | number): string {
  if (worked !== "term") {
    return "When the last payment falls";
  }
  return figure === null ? "Never, at this payment" : workedHint;
}
