import type { JSX, ReactNode } from "react";

import type { AccountKind, AccountValues, Funding } from "@/data/accounts";
import type { Owner } from "@/data/owners";

import { FieldRow } from "@/components/app/atoms/field-row";
import { MoneyField, RateField } from "@/components/app/molecules/figure-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { TextField } from "@/components/app/molecules/text-field";
import {
  allowanceOf,
  isOwned,
  isPension,
  kindLabels,
  takesSpare,
} from "@/data/accounts";
import { cadenceOptions } from "@/lib/cadence";
import { formatGbp, formatPercent, formatWholePercent } from "@/lib/money";
import { optionsOf } from "@/lib/options";
import { ownerFor, ownerOptions } from "@/lib/owners";
import { mostFixedOf } from "@/lib/tax";

export interface PortfolioOptions {
  readonly accounts: readonly string[];
  readonly hasGlide: boolean;
  readonly planRate: number;
  readonly rates: Readonly<Record<string, PortfolioRate>>;
}

// What the Accounts UI shows for a candidate Portfolio Performance
// securities account: either its bespoke nominal return and current
// stocks share, or why it falls back to the global plan rate.
export type PortfolioRate =
  | { readonly kind: "bespoke"; readonly rate: number; readonly stocks: number }
  | { readonly kind: "fallback"; readonly reason: string };

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
  readonly portfolio?: PortfolioOptions | undefined;
}

const fundings = [
  { label: "A fixed sum", value: "fixed" },
  { label: "Spare money", value: "spare" },
] as const;

const growths = [
  { label: "Plan rate", value: "plan" },
  { label: "Fixed rate", value: "fixed" },
] as const;

// What a pension is paid in a month that cannot pay it: all of it,
// drawn from the cash, the GIAs and the ISAs, or what the month has.
const shortfalls = [
  { label: "Draw on the savings", value: "kept" },
  { label: "Drop the payments", value: "dropped" },
] as const;

// The types the dialog offers, in the order the reference's offers
// them: a house and a car are left out, since each is written from a
// dialog of its own.
const kinds = optionsOf(kindLabels, [
  "tax-deferred",
  "tax-free",
  "taxable",
  "cash",
  "real-asset",
  "debt",
]);

// The fields the account's dialog takes, as the line fields are to the
// schedules' dialogs: the name and the treatment on the first row, with
// the owner beside them for an ISA or a pension, chosen from the owners
// the ledger hands down and held until there is one to choose, the
// balance and, for a wrapper, a GIA or cash, the contribution choice on the
// second, with a pension's choice beside them of what it is paid in a
// month that cannot pay it, what that choice asks for on the third, a
// sum and its cadence or a cap, and on the last the growth choice, with its rate stacked
// beneath it while the growth is fixed, or the rate alone for a debt,
// which is on a lender's rate as a loan is, beside whatever the dialog
// adds. The fields are uncontrolled and mount with the account as it
// opened, and report each change to the ledger, whose draft mirrors
// them. The treatment and the contribution choices are reported apart
// from the rest, since each changes more of the draft than its own
// value and the ledger decides what. The treatment is locked when the
// ledger gives a reason, which it does for a pension a salary feeds,
// since the store refuses to make one anything else, and the reason
// names the salaries. The slot beside the growth is where the dialog
// puts what the salaries sacrifice into such a pension: the growth
// row's other cell was the one cell the rows left empty, and the rate
// stacks under the growth rather than taking it, so a fed pension's
// six fields fill three rows and an account nothing feeds is laid out
// as it was. A fed pension's own contribution is paid on top of the
// sacrifice, and the choice and the sum say so, since a fixed sum of
// nothing beside what a salary lands would otherwise read as nothing
// paid in at all. The balance says a debt's is negative only while the
// treatment is a debt, where it is the one thing to know about the
// figure; beneath a pension's it was a line about something else.
// Beneath the growth row, a saving shows a full-width Portfolio
// account selector whenever live Portfolio Performance accounts exist
// or the account already carries a link; it stays mounted across
// growth toggles and previews its bespoke or fallback growth rate in
// its hint.
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
  portfolio,
}: AccountFieldsProps): JSX.Element {
  const isShowingPortfolio =
    takesSpare(draft) &&
    portfolio !== undefined &&
    (portfolio.accounts.length > 0 || initial.portfolio !== null);
  return (
    <div className="grid gap-4">
      <FieldRow layout={isOwned(draft) ? "triple" : "named"}>
        <TextField
          defaultValue={initial.name}
          label="Name"
          onValueChange={(name) => {
            onAmend({ name });
          }}
          placeholder="Lifetime ISA, savings account, loan…"
        />
        <SelectField
          defaultValue={initial.kind}
          hint={kindLock}
          isDisabled={kindLock !== undefined}
          label="Type"
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
                : undefined
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
      <FieldRow layout={isPension(draft) ? "triple" : "pair"}>
        <MoneyField
          defaultValue={initial.balance}
          hint={draft.kind === "debt" ? "A debt's is negative" : undefined}
          label="Balance"
          onValueCommitted={(balance) => {
            onAmend({ balance });
          }}
        />
        {takesSpare(draft) && (
          <SelectField
            defaultValue={initial.funding}
            hint={isFed ? "On top of the salary sacrifice" : undefined}
            label="Contribution"
            onValueChange={(funding) => {
              onFundingChange(funding);
            }}
            options={fundings}
          />
        )}
        {isPension(draft) && (
          <SelectField
            defaultValue={initial.isDroppable ? "dropped" : "kept"}
            hint={draft.isDroppable ? undefined : "From cash, GIAs and ISAs"}
            label="When short"
            onValueChange={(shortfall) => {
              onAmend({ isDroppable: shortfall === "dropped" });
            }}
            options={shortfalls}
          />
        )}
      </FieldRow>
      <FieldRow layout="pair">
        {draft.funding === "fixed" ? (
          <>
            <MoneyField
              defaultValue={initial.contribution}
              hint={amountHint(draft.kind, isFed)}
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
          {draft.kind !== "debt" && (
            <SelectField
              defaultValue={initial.growth}
              label="Growth"
              onValueChange={(growth) => {
                onAmend({ growth, rate: initial.rate });
              }}
              options={growths}
            />
          )}
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
      {isShowingPortfolio && (
        <SelectField
          defaultValue={initial.portfolio ?? ""}
          hint={portfolioHint(draft, portfolio)}
          label="Portfolio account"
          onValueChange={(value) => {
            onAmend({ portfolio: value === "" ? null : value });
          }}
          options={portfolioSelectOptions(
            portfolio.accounts,
            initial.portfolio,
          )}
        />
      )}
    </div>
  );
}

// What the amount field says for an ISA or a pension: the most it can
// be a year and still land within the allowance, which the save holds
// to, a pension's four fifths of it, the rest being the relief. A fed
// pension's sum is on top of what the salaries sacrifice, which the
// allowance holds too, month by month.
function amountHint(kind: AccountKind, isFed: boolean): string | undefined {
  const most = mostFixedOf(kind);
  if (most === null) {
    return undefined;
  }
  const limit =
    most === allowanceOf(kind)
      ? `At most ${formatGbp(most)} a year`
      : `At most ${formatGbp(most)} a year, before relief`;
  return isFed ? `${limit}, less the sacrifice` : limit;
}

// How a bespoke Portfolio rate moves a year in the Account dialog preview.
function bespokeMoveOf(rate: number, hasGlide: boolean): string {
  const nowSuffix = hasGlide ? " now" : "";
  if (rate > 0) {
    return `Grows ${formatPercent(rate)} a year${nowSuffix}`;
  }
  return rate < 0
    ? `Loses ${formatPercent(-rate)} a year${nowSuffix}`
    : `Holds its value${nowSuffix}`;
}

// What the cap field says a cap of nothing means for an ISA or a
// pension: the kind's allowance, which a cap can only lower.
function capHint(kind: AccountKind): string | undefined {
  const allowance = allowanceOf(kind);
  return allowance === null
    ? undefined
    : `Nothing for the full ${formatGbp(allowance)} allowance`;
}

// Live growth preview beneath the Portfolio account selector.
function portfolioHint(
  draft: Pick<AccountValues, "growth" | "portfolio">,
  { hasGlide, planRate, rates }: PortfolioOptions,
): string {
  if (draft.growth === "fixed") {
    return draft.portfolio === null
      ? "Only applies on the plan rate"
      : "Fixed rate overrides Portfolio growth";
  }
  const nowSuffix = hasGlide ? " now" : "";
  const preview =
    draft.portfolio !== null && Object.hasOwn(rates, draft.portfolio)
      ? rates[draft.portfolio]
      : undefined;
  if (preview === undefined) {
    return `Uses the plan rate, ${formatPercent(planRate)}${nowSuffix}`;
  }
  if (preview.kind === "fallback") {
    return `Uses the plan rate, ${formatPercent(planRate)}${nowSuffix}. ${preview.reason}.`;
  }
  const mix = hasGlide
    ? "following the glide path"
    : splitLabelOf(preview.stocks);
  return `${bespokeMoveOf(preview.rate, hasGlide)} · ${mix}`;
}

// The options offered by the Portfolio account selector: unlinked,
// live/synced accounts, and any stale saved link on this account.
function portfolioSelectOptions(
  accounts: readonly string[],
  initial: null | string,
): readonly { readonly label: string; readonly value: string }[] {
  return [
    { label: "Not linked", value: "" },
    ...accounts.map((name) => ({ label: name, value: name })),
    ...(initial !== null && !accounts.includes(initial)
      ? [{ label: `${initial} (not in Portfolio)`, value: initial }]
      : []),
  ];
}

// The equity/bond mix label for a bespoke Portfolio preview without a
// glide path, rounding stocks once so stocks and bonds always sum to
// 100%.
function splitLabelOf(stocks: number): string {
  if (stocks === 1) {
    return "100% stocks";
  }
  if (stocks === 0) {
    return "100% bonds";
  }
  const stocksPercent = Math.min(99, Math.max(1, Math.round(stocks * 100)));
  return `${formatWholePercent(stocksPercent / 100)} stocks, ${formatWholePercent((100 - stocksPercent) / 100)} bonds`;
}
