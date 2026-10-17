import type { JSX } from "react";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type {
  LoanDraft,
  LoanWords,
} from "@/components/app/organisms/loan-fields";
import type {
  HouseDraft,
  HouseValues,
  MoveChoice,
  MoveValues,
  PartDraft,
  Status,
} from "@/data/houses";
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
import { openingMove, statuses } from "@/data/houses";
import { formatMonth } from "@/lib/months";
import { optionsOf } from "@/lib/options";

interface HouseFieldsProps {
  readonly draft: HouseDraft<PartDraft & WorkedOut>;
  readonly initial: HouseDraft;
  readonly milestones: readonly MoveChoice[];
  readonly onAdd: () => void;
  readonly onAmend: (patch: Partial<Omit<HouseValues, "parts">>) => void;
  readonly onAmendPart: (key: number, patch: Partial<LoanDraft>) => void;
  readonly onRemove: (key: number) => void;
  readonly onWork: (key: number, worked: LoanFigure) => void;
  readonly plan: PlanMonth;
}

// A move's fields: the move as the draft has it, and where a change to
// it is reported.
interface MoveProps {
  readonly move: MoveValues;
  readonly onAmend: (move: MoveValues) => void;
}

// The choice of a house staying put rather than moving at a milestone.
const staying = "stays";

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
// loan fields at all. Beneath them all is whether the house moves, at
// one of the milestones it is offered, each named with its year, or
// stays put. A house moving shows the move's own fields, which mount
// when it is chosen and open on the move as it stands, and the
// mortgage's rate and term only while it borrows something.
export function HouseFields({
  draft,
  initial,
  milestones,
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
      <FieldRow layout="pair">
        <SelectField
          defaultValue={
            initial.move === null ? staying : String(initial.move.at)
          }
          hint="Sold, and the next bought, as its year opens"
          label="Moves"
          onValueChange={(choice) => {
            const marker = milestones.find(({ id }) => String(id) === choice);
            onAmend({
              move:
                marker === undefined
                  ? null
                  : {
                      ...(draft.move ?? openingMove),
                      at: marker.id,
                      year: marker.year,
                    },
            });
          }}
          options={[
            { label: "Stays put", value: staying },
            ...milestones.map(({ id, name, year }) => ({
              label: `At ${name} · ${String(year)}`,
              value: String(id),
            })),
          ]}
        />
      </FieldRow>
      {draft.move !== null && (
        <MoveFields
          move={draft.move}
          onAmend={(move) => {
            onAmend({ move });
          }}
          status={draft.status}
        />
      )}
    </div>
  );
}

// The fields of a mortgage a move takes out, its rate and term, which
// mount whenever the move comes to borrow something, each on the move
// as it stood then, held as the move's own fields hold theirs.
function MortgageFields({ move, onAmend }: MoveProps): JSX.Element {
  const [opened] = useState(move);
  return (
    <FieldRow layout="pair">
      <RateField
        defaultValue={opened.rate}
        hint="A year"
        label="Mortgage rate"
        min={0}
        onValueCommitted={(rate) => {
          onAmend({ ...move, rate });
        }}
      />
      <YearField
        defaultValue={opened.term}
        hint="Years"
        label="Mortgage term"
        min={1}
        onValueCommitted={(term) => {
          onAmend({ ...move, term });
        }}
      />
    </FieldRow>
  );
}

// The fields of a move: what the next house costs and the ceiling it is
// held to, in today's money, and the most of its price the mortgage
// borrows, then while it borrows anything the mortgage's own fields.
// Each mounts on the move as it stood when the fields did, held so the
// figures they open on stay put as the draft moves, and reports the
// move changed. A house owned outright borrows nothing as it moves,
// since its move has no loan to carry a mortgage in, and the share it
// would borrow says so, as the reason the save holds.
function MoveFields({
  move,
  onAmend,
  status,
}: MoveProps & { readonly status: Status }): JSX.Element {
  const [opened] = useState(move);
  return (
    <>
      <FieldRow layout="triple">
        <MoneyField
          defaultValue={opened.price}
          hint="Today's money"
          label="Next house costs"
          min={0}
          onValueCommitted={(price) => {
            onAmend({ ...move, price });
          }}
        />
        <MoneyField
          defaultValue={opened.ceiling}
          hint="Today's money, £0 for none"
          label="Next ceiling"
          min={0}
          onValueCommitted={(ceiling) => {
            onAmend({ ...move, ceiling });
          }}
        />
        <RateField
          defaultValue={opened.loanToValue}
          {...(status === "outright" &&
            move.loanToValue > 0 && {
              error: "A house owned outright borrows nothing as it moves",
            })}
          hint="Of the price, 0% to borrow nothing"
          label="Borrows up to"
          max={1}
          min={0}
          onValueCommitted={(loanToValue) => {
            onAmend({ ...move, loanToValue });
          }}
        />
      </FieldRow>
      {move.loanToValue > 0 && <MortgageFields move={move} onAmend={onAmend} />}
    </>
  );
}
