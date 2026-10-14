import type { JSX } from "react";

import { Plus, Trash2 } from "lucide-react";

import type {
  LoanDraft,
  LoanWords,
} from "@/components/app/organisms/loan-fields";
import type { HouseDraft, HouseValues, PartDraft, Status } from "@/data/houses";
import type { LoanFigure, WorkedOut } from "@/lib/figures";
import type { PlanMonth } from "@/lib/loans";

import { FieldRow } from "@/components/app/atoms/field-row";
import { RowAction } from "@/components/app/atoms/row-action";
import {
  MoneyField,
  RateField,
  YearField,
} from "@/components/app/molecules/figure-field";
import { MonthField } from "@/components/app/molecules/month-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { LoanFields } from "@/components/app/organisms/loan-fields";
import { Button } from "@/components/kit/button";
import { statuses } from "@/data/houses";
import { formatMonth } from "@/lib/months";
import { optionsOf } from "@/lib/options";

interface HouseFieldsProps {
  readonly draft: HouseDraft<PartDraft & WorkedOut>;
  readonly initial: HouseDraft;
  readonly onAdd: () => void;
  readonly onAmend: (patch: Partial<Omit<HouseValues, "parts">>) => void;
  readonly onAmendPart: (key: number, patch: Partial<LoanDraft>) => void;
  readonly onRemove: (key: number) => void;
  readonly onWork: (key: number, worked: LoanFigure) => void;
  readonly plan: PlanMonth;
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
  never: "Never clears at this payment",
  noRate: "No rate clears the balance over the term",
};

// The fields the house dialog takes: the name and the status on the first
// row, what the house is worth, the rate it grows at and the ceiling it
// grows no higher than on the second,
// the month and the year it was bought in and what it cost on the
// third, and for a mortgaged house the loan fields every secured loan
// takes beneath them, in the house's words, once for each sub-account,
// each showing the figure worked out of it, with a press adding another
// beneath them all. A mortgage in more than one sub-account names each
// by its place, over its fields, with the press that removes it, so
// the fields repeated are told apart and the last cannot be removed. The year bought is held
// between the first year there is and the year the plan starts in,
// since a house is bought in a year that has begun and the store takes
// none before the first. The typed fields are uncontrolled, mount with
// the house as it opened and report each change to the dialog, whose
// draft mirrors them; the month is a choice by value, as every month
// field is, and shows the draft's. A house owned outright shows no
// loan fields at all.
export function HouseFields({
  draft,
  initial,
  onAdd,
  onAmend,
  onAmendPart,
  onRemove,
  onWork,
  plan,
}: HouseFieldsProps): JSX.Element {
  const isParted = draft.parts.length > 1;
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
      <FieldRow layout="triple">
        <MoneyField
          defaultValue={initial.value}
          hint={`As of ${formatMonth({ month: plan.month, year: plan.from })}`}
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
        <MoneyField
          defaultValue={initial.ceiling}
          hint="Today's money, £0 for none"
          label="Ceiling"
          min={0}
          onValueCommitted={(ceiling) => {
            onAmend({ ceiling });
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
          label="Bought for"
          min={0}
          onValueCommitted={(price) => {
            onAmend({ bought: { ...draft.bought, price } });
          }}
        />
      </FieldRow>
      {draft.status === "mortgaged" && (
        <>
          {draft.parts.map((part, place) => {
            const name = `Sub-account ${String(place + 1)}`;
            return (
              <div
                className="grid gap-4"
                key={part.key}
                {...(isParted && { "aria-label": name, role: "group" })}
              >
                {isParted && (
                  <div className="flex items-center justify-between gap-4 border-t pt-3">
                    <p className="label text-muted-foreground">{name}</p>
                    <RowAction
                      icon={Trash2}
                      name={`Remove ${name.toLowerCase()}`}
                      onClick={() => {
                        onRemove(part.key);
                      }}
                      tone="destructive"
                    />
                  </div>
                )}
                <LoanFields
                  draft={part}
                  figure={part.figure}
                  onAmend={(patch) => {
                    onAmendPart(part.key, patch);
                  }}
                  onWork={(next) => {
                    onWork(part.key, next);
                  }}
                  plan={plan}
                  words={words}
                  worked={part.worked}
                />
              </div>
            );
          })}
          <div>
            <Button onClick={onAdd} size="sm" variant="outline">
              <Plus aria-hidden />
              Add sub-account
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
