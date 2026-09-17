import type { JSX } from "react";

import type { AccountKind, AccountValues, Funding } from "@/data/accounts";

import { MoneyField } from "@/components/app/molecules/money-field";
import { RateField } from "@/components/app/molecules/rate-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import { allowanceOf, isAsset } from "@/data/accounts";
import { cadenceOptions } from "@/lib/cadence";
import { formatGbp } from "@/lib/money";

interface AccountFieldsProps {
  readonly draft: AccountValues;
  readonly initial: AccountValues;
  readonly onAmend: (patch: Partial<AccountValues>) => void;
  readonly onFundingChange: (funding: Funding) => void;
  readonly onKindChange: (kind: AccountKind) => void;
}

const fundings = [
  { label: "A fixed sum", value: "fixed" },
  { label: "Spare money", value: "spare" },
] as const;

const growths = [
  { label: "Plan rate", value: "plan" },
  { label: "Fixed rate", value: "fixed" },
] as const;

const kinds = [
  { label: "Tax-deferred", value: "tax-deferred" },
  { label: "Tax-free", value: "tax-free" },
  { label: "Cash", value: "cash" },
  { label: "Real asset", value: "real-asset" },
  { label: "Debt", value: "debt" },
] as const;

// The fields the account's dialog takes, as the line fields are to the
// schedules' dialogs: the name and the treatment on the first row, the
// balance and, for a wrapper or cash, the contribution choice on the
// second, what that choice asks for on the third, a sum and its cadence
// or a cap, and the growth choice with its rate on the last. The fields
// are uncontrolled and mount with the account as it opened, and report
// each change to the ledger, whose draft mirrors them. The treatment and
// the contribution choices are reported apart from the rest, since each
// changes more of the draft than its own value and the ledger decides
// what.
export function AccountFields({
  draft,
  initial,
  onAmend,
  onFundingChange,
  onKindChange,
}: AccountFieldsProps): JSX.Element {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
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
          label="Treatment"
          onValueChange={(kind) => {
            onKindChange(kind);
          }}
          options={kinds}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <MoneyField
          defaultValue={initial.balance}
          hint="A debt's is negative"
          label="Balance"
          onValueCommitted={(balance) => {
            onAmend({ balance });
          }}
        />
        {!isAsset(draft) && (
          <SelectField
            defaultValue={initial.funding}
            hint="Spare money is what a month's income leaves after the expenses and every fixed sum"
            label="Contribution"
            onValueChange={(funding) => {
              onFundingChange(funding);
            }}
            options={fundings}
          />
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {draft.funding === "fixed" ? (
          <>
            <MoneyField
              defaultValue={initial.contribution}
              hint="Leave at nothing for none"
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
      </div>
      <div className="grid grid-cols-2 gap-4">
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
    </div>
  );
}

// What the cap field says a cap of nothing means: the kind's allowance,
// or no cap at all for cash.
function capHint(kind: AccountKind): string {
  const allowance = allowanceOf(kind);
  return allowance === null
    ? "Leave at nothing for no cap"
    : `Leave at nothing for the ${formatGbp(allowance)} allowance`;
}
