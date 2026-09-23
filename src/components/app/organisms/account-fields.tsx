import type { JSX, ReactNode } from "react";

import type { AccountKind, AccountValues, Funding } from "@/data/accounts";
import type { Owner } from "@/data/owners";

import { FieldRow } from "@/components/app/atoms/field-row";
import { MoneyField } from "@/components/app/molecules/money-field";
import { RateField } from "@/components/app/molecules/rate-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { allowanceOf, isOwned, kindLabels, takesSpare } from "@/data/accounts";
import { cadenceOptions } from "@/lib/cadence";
import { formatGbp } from "@/lib/money";
import { optionsOf } from "@/lib/options";
import { ownerFor, ownerOptions } from "@/lib/owners";

interface AccountFieldsProps {
  readonly children?: ReactNode;
  readonly draft: AccountValues;
  readonly initial: AccountValues;
  readonly isFed?: boolean;
  readonly kindLock?: string | undefined;
  readonly onAmend: (patch: Partial<AccountValues>) => void;
  readonly onFundingChange: (funding: Funding) => void;
  readonly onKindChange: (kind: AccountKind) => void;
  readonly owners: readonly Owner[];
}

const fundings = [
  { label: "A fixed sum", value: "fixed" },
  { label: "Spare money", value: "spare" },
] as const;

// The same choices for a pension a salary feeds, where a fixed sum of
// nothing is the usual case rather than an unfilled field, and says so.
const fundingsOnTop = [
  { label: "A fixed sum, or nothing", value: "fixed" },
  { label: "Spare money", value: "spare" },
] as const;

const growths = [
  { label: "Plan rate", value: "plan" },
  { label: "Fixed rate", value: "fixed" },
] as const;

// The treatments the dialog offers, in the order the reference's offers
// them: a house and a car are left out, since each is written from a
// dialog of its own.
const kinds = optionsOf(kindLabels, [
  "tax-deferred",
  "tax-free",
  "cash",
  "real-asset",
  "debt",
]);

// The fields the account's dialog takes, as the line fields are to the
// schedules' dialogs: the name and the treatment on the first row, with
// the owner beside them for an ISA or a pension, chosen from the owners
// the ledger hands down and held until there is one to choose, the
// balance and, for a wrapper or cash, the contribution choice on the
// second, what that choice asks for on the third, a sum and its cadence
// or a cap, and on the last the growth choice, with its rate stacked
// beneath it while the growth is fixed, beside whatever the dialog
// adds. The fields are uncontrolled and mount with the account as it
// opened, and report each change to the ledger, whose draft mirrors
// them. The treatment and the contribution choices are reported apart
// from the rest, since each changes more of the draft than its own
// value and the ledger decides what. The treatment is locked when the
// ledger gives a reason, which it does for a pension a salary feeds,
// since the store refuses to make one anything else and the reason
// says how to unlink it. The slot beside the growth is where the dialog
// puts what the salaries sacrifice into such a pension: the growth
// row's other cell was the one cell the rows left empty, and the rate
// stacks under the growth rather than taking it, so a fed pension's
// six fields fill three rows and an account nothing feeds is laid out
// as it was. A fed pension's own contribution is paid on top of the
// sacrifice, and the choice and the sum say so, since a fixed sum of
// nothing beside what a salary lands would otherwise read as nothing
// paid in at all.
export function AccountFields({
  children,
  draft,
  initial,
  isFed = false,
  kindLock,
  onAmend,
  onFundingChange,
  onKindChange,
  owners,
}: AccountFieldsProps): JSX.Element {
  return (
    <div className="grid gap-4">
      <FieldRow layout={isOwned(draft) ? "triple" : "named"}>
        <TextField
          defaultValue={initial.name}
          label="Name"
          onValueChange={(name) => {
            onAmend({ name });
          }}
          placeholder="Lifetime ISA, car, loan…"
        />
        <SelectField
          defaultValue={initial.kind}
          hint={kindLock}
          isDisabled={kindLock !== undefined}
          label="Treatment"
          onValueChange={(kind) => {
            onKindChange(kind);
          }}
          options={kinds}
        />
        {isOwned(draft) && (
          <SelectField
            defaultValue={String(ownerFor(initial.owner, owners) ?? "")}
            hint={
              owners.length === 0
                ? "Add one in the owners section first"
                : "Whose allowance it is paid under"
            }
            isDisabled={owners.length === 0}
            label="Owner"
            onValueChange={(owner) => {
              onAmend({ owner: Number(owner) });
            }}
            options={ownerOptions(owners)}
          />
        )}
      </FieldRow>
      <FieldRow layout="pair">
        <MoneyField
          defaultValue={initial.balance}
          hint="A debt's is negative"
          label="Balance"
          onValueCommitted={(balance) => {
            onAmend({ balance });
          }}
        />
        {takesSpare(draft) && (
          <SelectField
            defaultValue={initial.funding}
            hint={
              isFed
                ? "Paid in on top of the salary sacrifice"
                : "Spare money is what a month's income leaves after the expenses and every fixed sum"
            }
            label="Contribution"
            onValueChange={(funding) => {
              onFundingChange(funding);
            }}
            options={isFed ? fundingsOnTop : fundings}
          />
        )}
      </FieldRow>
      <FieldRow layout="pair">
        {draft.funding === "fixed" ? (
          <>
            <MoneyField
              defaultValue={initial.contribution}
              hint={
                isFed
                  ? "Leave at nothing for none on top"
                  : "Leave at nothing for none"
              }
              // Keyed apart from the cap, which takes its place:
              // the fragment is unwrapped and the two would be
              // one field, keeping what was typed into the other.
              key="contribution"
              label="Amount"
              onValueCommitted={(contribution) => {
                onAmend({ contribution });
              }}
            />
            <SelectField
              defaultValue={initial.cadence}
              label="Cadence"
              onValueChange={(cadence) => {
                onAmend({ cadence });
              }}
              options={cadenceOptions}
            />
          </>
        ) : (
          <MoneyField
            defaultValue={initial.cap}
            hint={capHint(draft.kind)}
            key="cap"
            label="Cap, a year"
            onValueCommitted={(cap) => {
              onAmend({ cap });
            }}
          />
        )}
      </FieldRow>
      <FieldRow layout="pair-top">
        <div className="grid gap-4">
          <SelectField
            defaultValue={initial.growth}
            hint="The plan rate is set on the assumptions screen"
            label="Growth"
            onValueChange={(growth) => {
              onAmend({ growth, rate: initial.rate });
            }}
            options={growths}
          />
          {draft.growth === "fixed" && (
            <RateField
              defaultValue={initial.rate}
              hint="Nominal, a year"
              label="Rate"
              onValueCommitted={(rate) => {
                onAmend({ rate });
              }}
            />
          )}
        </div>
        {children}
      </FieldRow>
    </div>
  );
}

// What the cap field says a cap of nothing means: the kind's allowance,
// which a cap can only lower, or no cap at all for cash.
function capHint(kind: AccountKind): string {
  const allowance = allowanceOf(kind);
  return allowance === null
    ? "Leave at nothing for no cap"
    : `Up to the ${formatGbp(allowance)} allowance, or nothing for all of it`;
}
