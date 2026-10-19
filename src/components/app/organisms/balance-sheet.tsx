import type { JSX, ReactNode } from "react";

import { cn } from "cn";
import { Plus, Scale } from "lucide-react";
import { useId } from "react";

import type { Account } from "@/data/accounts";
import type { ExpenseLine } from "@/data/expenses";
import type { Owner } from "@/data/owners";
import type { Secured } from "@/data/secured";

import { EmptyState } from "@/components/app/atoms/empty-state";
import { FoldedLines } from "@/components/app/atoms/folded-lines";
import { Ledger } from "@/components/app/atoms/ledger";
import { ShareBar } from "@/components/app/atoms/share-bar";
import { Button } from "@/components/kit/button";
import { isPension, kindLabels } from "@/data/accounts";
import { mortgageOn } from "@/data/houses";
import { fixedMonthly } from "@/lib/cadence";
import { counted } from "@/lib/count";
import {
  balanceOf,
  drawingTaxOf,
  equityOf,
  formatMonthly,
  sumOf,
} from "@/lib/ledger";
import { formatGbp, formatPercent, negated } from "@/lib/money";
import { monthName } from "@/lib/months";

interface BalanceSheetProps {
  readonly assets: readonly Secured[];
  readonly debts: readonly Account[];
  readonly expenses: readonly ExpenseLine[];
  readonly onAddDebt: () => void;
  readonly onEdit: (account: Account) => void;
  readonly owners: readonly Owner[];
  readonly savings: readonly Account[];
}

interface GroupProps {
  readonly children: ReactNode;
  readonly figure: string;
  readonly title: string;
}

interface RowProps {
  readonly account: Account;
  readonly children?: ReactNode;
  readonly onEdit: (account: Account) => void;
  readonly place?: number | undefined;
}

// The savings in the groups the sheet lists them under: the kinds the
// payment order draws on one at a time, pensions, then ISAs, then GIAs,
// then cash.
const groups = [
  { kind: "tax-deferred", title: "Pensions · tax-deferred" },
  { kind: "tax-free", title: "ISAs · tax-free" },
  { kind: "taxable", title: "GIAs · taxable" },
  { kind: "cash", title: "Cash" },
] as const;

// What the plan starts from, as one balance sheet: what the household
// owns on the left, what it owes on the right, and the starting net
// worth ruled off beneath both, worked out from the two totals and the
// tax on the pensions counted as drawn at the basic rate, so it is read
// as a sum rather than stated and is the net worth the plan opens on.
// The savings are grouped by kind,
// each group under its subtotal, and numbered in the order they are
// paid in when there are two or more, since that order runs across the
// kinds. Each asset is drawn level with the loan secured on it, so the
// house and its mortgage read as one entry across the fold, and the
// other debts, secured on nothing with a row, head the right-hand page
// beside the savings, with the button that adds one. A mortgage held in
// more than one sub-account is drawn as the one mortgage it is, with
// each sub-account beneath it. While the sheet is
// too narrow for two pages, as on a phone, the pages stack and a loan
// sits beneath its asset. Every row opens the account it is, a loan
// the asset it is secured on, and the dialog it opens is where it is
// deleted from. A debt and a loan are written below nothing on both
// pages, as their balances are, so the totals add up as they read; the
// words beneath the total owed say what is owed, above nothing. An
// empty sheet draws its empty state instead.
export function BalanceSheet({
  assets,
  debts,
  expenses,
  onAddDebt,
  onEdit,
  owners,
  savings,
}: BalanceSheetProps): JSX.Element {
  const propertyId = useId();
  if (savings.length === 0 && assets.length === 0 && debts.length === 0) {
    return (
      <EmptyState
        description="Add an account, a house or a car."
        icon={Scale}
        title="Nothing on the balance sheet yet"
      />
    );
  }

  const loans = assets.flatMap(({ loans: secured }) => secured);
  const saved = balanceOf(savings);
  const worth = sumOf(assets, ({ asset }) => asset.balance);
  const secured = balanceOf(loans);
  const unsecured = balanceOf(debts);
  const pensions = balanceOf(savings.filter(isPension));
  const tax = drawingTaxOf(savings);
  const isOrdered = savings.length > 1;

  return (
    <div className="@container">
      <div className="grid gap-y-8 unfolded:grid-cols-2 unfolded:gap-x-12">
        <div className="grid content-start gap-6">
          <Page>What we own</Page>
          {savings.length === 0 ? (
            <Group figure={formatGbp(0)} title="Savings">
              <None>No pension, ISA or savings account yet</None>
            </Group>
          ) : (
            groups.map(({ kind, title }) => {
              const held = savings.filter((account) => account.kind === kind);
              return (
                held.length > 0 && (
                  <Group
                    figure={formatGbp(balanceOf(held))}
                    key={kind}
                    title={title}
                  >
                    {held.map((account) => (
                      <Row
                        account={account}
                        key={account.id}
                        onEdit={onEdit}
                        place={
                          isOrdered ? savings.indexOf(account) + 1 : undefined
                        }
                      >
                        {aboutOf(account, owners)}
                      </Row>
                    ))}
                  </Group>
                )
              );
            })
          )}
        </div>
        <div
          aria-labelledby={propertyId}
          className="grid content-start unfolded:col-span-2"
          role="group"
        >
          <div className="grid unfolded:grid-cols-2 unfolded:gap-x-12">
            <Heading figure={formatGbp(worth)} id={propertyId}>
              Property & vehicles
            </Heading>
            <Heading className="folded:hidden" figure={formatGbp(secured)}>
              Secured on them
            </Heading>
          </div>
          <ul className="divide-y">
            {assets.length === 0 && <None>No house or car yet</None>}
            {assets.map((pair) => (
              <li
                className="grid unfolded:grid-cols-2 unfolded:gap-x-12"
                key={pair.asset.id}
              >
                <div className="relative py-3">
                  <AssetLines onEdit={onEdit} pair={pair} />
                </div>
                {pair.loans.length > 0 && (
                  <div className="relative py-3 folded:pt-0 folded:pl-4">
                    <SecuredLines
                      expenses={expenses}
                      onOpen={() => {
                        onEdit(pair.asset);
                      }}
                      pair={pair}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="grid content-start gap-6 unfolded:col-start-2 unfolded:row-start-1">
          <Page>What we owe</Page>
          <Group figure={formatGbp(unsecured)} title="Other debts">
            {debts.length === 0 && <None>None</None>}
            {debts.map((debt) => (
              <Row account={debt} key={debt.id} onEdit={onEdit}>
                <span>{loanOf(debt, expenses)}</span>
              </Row>
            ))}
          </Group>
          <Button
            className="justify-self-start"
            onClick={onAddDebt}
            size="sm"
            variant="outline"
          >
            <Plus aria-hidden />
            Add debt
          </Button>
        </div>
        <div className="border-t pt-4 unfolded:col-span-2">
          <Ledger
            steps={[
              {
                detail: `${formatGbp(saved)} in savings and ${formatGbp(worth)} in property and vehicles`,
                figure: formatGbp(saved + worth),
                label: "Total owned",
              },
              {
                detail: `${formatGbp(negated(secured))} secured on property and vehicles and ${formatGbp(negated(unsecured))} in other debts`,
                figure: formatGbp(secured + unsecured),
                label: "Total owed",
              },
              {
                detail: `${formatGbp(pensions)} in pensions counted as drawn at the basic rate, a quarter free of tax as far as each owner's lump sum allowance reaches`,
                figure: formatGbp(negated(tax)),
                label: "Tax on drawing the pensions",
              },
            ]}
            total={formatGbp(saved + worth + secured + unsecured - tax)}
            totalName="Starting net worth"
          />
        </div>
      </div>
    </div>
  );
}

// What a saving's row says of it beneath its name, its group having
// said its kind: whose it is, when it is anyone's, a rate of its own
// where it does not grow at the plan's, and a pension marked droppable
// saying so in words, since every other pension is kept paid when the
// month runs short; or no line for one with none of them.
function aboutOf(
  account: Account,
  owners: readonly Owner[],
): JSX.Element | undefined {
  const said = [
    owners.find(({ id }) => id === account.owner)?.name,
    account.growth.kind === "fixed" ? growthOf(account) : undefined,
    account.isDroppable === true ? "dropped when short" : undefined,
  ].filter((part) => part !== undefined);
  return said.length === 0 ? undefined : <span>{said.join(" · ")}</span>;
}

// An asset's lines: what it is and how its value moves, then the equity
// it holds once the loans on it are paid, as a bar of its value and in
// words, so the bar is never the only thing saying it, and what is paid
// into it of its own, which only an asset the account dialog writes may
// take.
function AssetLines({
  onEdit,
  pair,
}: {
  readonly onEdit: (account: Account) => void;
  readonly pair: Secured;
}): JSX.Element {
  const { asset } = pair;
  const equity = equityOf(pair);
  const share = equity / asset.balance;
  const paid = fixedMonthly(asset);
  const part = Number.isFinite(share)
    ? `${String(Math.round(share * 100))}%`
    : "none";
  return (
    <FoldedLines
      figure={formatGbp(asset.balance)}
      name={asset.name}
      onOpen={() => {
        onEdit(asset);
      }}
    >
      <span>{`${kindLabels[asset.kind]} · ${growthOf(asset)}`}</span>
      {pair.loans.length > 0 && (
        <>
          <ShareBar className="my-1 h-1.5 w-full" share={share} />
          <span>{`${formatGbp(equity)} equity, ${part} of its value`}</span>
        </>
      )}
      {paid > 0 && <span>{`${formatMonthly(paid)} paid in`}</span>}
    </FoldedLines>
  );
}

// A group of rows under its name and its subtotal, named by the name
// alone.
function Group({ children, figure, title }: GroupProps): JSX.Element {
  const id = useId();
  return (
    <div aria-labelledby={id} role="group">
      <Heading figure={figure} id={id}>
        {title}
      </Heading>
      <ul className="divide-y">{children}</ul>
    </div>
  );
}

// How an account's value moves a year, in words: at the plan's rate,
// at its own, or not at all, a rate below nothing being a loss.
function growthOf({ growth }: Account): string {
  if (growth.kind === "plan") {
    return "grows at the plan rate";
  }
  if (growth.rate > 0) {
    return `grows ${formatPercent(growth.rate)} a year`;
  }
  return growth.rate < 0
    ? `loses ${formatPercent(-growth.rate)} a year`
    : "holds its value";
}

// A group's name and its subtotal, on one line under a rule, the name
// carrying the id a group is labelled by.
function Heading({
  children,
  className,
  figure,
  id,
}: {
  readonly children: string;
  readonly className?: string;
  readonly figure: string;
  readonly id?: string;
}): JSX.Element {
  return (
    <h3
      className={cn(
        "flex items-baseline justify-between gap-4 border-b pb-2 label text-muted-foreground",
        className,
      )}
    >
      <span id={id}>{children}</span>
      <span className="figure">{figure}</span>
    </h3>
  );
}

// What a loan or a debt is charged, paid and, when a line pays it, the
// month that line's payments clear it in, which the household works out
// from the loan whenever it is read; and the balloon a PCP leaves.
function loanOf(debt: Account, expenses: readonly ExpenseLine[]): string {
  const line = expenses.find(({ pays }) => pays === debt.id);
  const year = line?.lastYear ?? null;
  const paid = fixedMonthly(debt);
  return [
    debt.growth.kind === "fixed"
      ? `at ${formatPercent(debt.growth.rate)}`
      : "at the plan rate",
    paid > 0 ? formatMonthly(paid) : undefined,
    year === null
      ? undefined
      : `to ${monthName(line?.lastMonth ?? 11, "short")} ${String(year)}`,
    debt.balloon === undefined
      ? undefined
      : `${formatGbp(debt.balloon)} balloon`,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}

// An item saying a group holds nothing, faint, in the group's list as
// a row would be.
function None({ children }: { readonly children: string }): JSX.Element {
  return <li className="py-3 text-sm text-muted-foreground">{children}</li>;
}

// The name of a page of the sheet, over its column while there are two,
// and gone while they stack, since the groups then say which side each
// is on.
function Page({ children }: { readonly children: string }): JSX.Element {
  return (
    <p className="font-heading text-sm font-medium folded:hidden">{children}</p>
  );
}

// A row of the sheet: the account's name and balance, opening the
// account, with its place in the order of payment in the margin when it
// has one, and what is said of it beneath.
function Row({ account, children, onEdit, place }: RowProps): JSX.Element {
  return (
    <li className="relative flex gap-3 py-3">
      {place !== undefined && (
        <span
          aria-hidden
          className="w-4 shrink-0 pt-0.5 figure text-xs text-muted-foreground"
        >
          {place}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <FoldedLines
          figure={formatGbp(account.balance)}
          name={account.name}
          onOpen={() => {
            onEdit(account);
          }}
        >
          {children}
        </FoldedLines>
      </div>
    </li>
  );
}

// What is secured on an asset, level with it, opening the asset: each
// loan, with what it is charged, paid and when it clears; or a mortgage
// held in more than one sub-account as the one mortgage it is, owing
// them all and paying a month what those still owing pay, with each
// sub-account beneath it as one loan alone would be said.
function SecuredLines({
  expenses,
  onOpen,
  pair,
}: {
  readonly expenses: readonly ExpenseLine[];
  readonly onOpen: () => void;
  readonly pair: Secured;
}): JSX.Element {
  const { loans } = pair;
  const mortgage = mortgageOn(pair);
  if (mortgage === null) {
    return (
      <>
        {loans.map((loan) => (
          <FoldedLines
            figure={formatGbp(loan.balance)}
            key={loan.id}
            name={loan.name}
            onOpen={onOpen}
          >
            <span>{loanOf(loan, expenses)}</span>
          </FoldedLines>
        ))}
      </>
    );
  }
  const owing = loans.filter(({ balance }) => balance < 0);
  return (
    <FoldedLines
      figure={formatGbp(balanceOf(loans))}
      name={mortgage.name}
      onOpen={onOpen}
    >
      <span>{`${formatMonthly(sumOf(owing, fixedMonthly))} in ${counted(loans.length, "sub-account")}`}</span>
      <ul className="mt-1 grid gap-1 border-l pl-3">
        {loans.map((loan) => (
          <li key={loan.id}>
            <FoldedLines figure={formatGbp(loan.balance)} name={loan.name}>
              <span>{loanOf(loan, expenses)}</span>
            </FoldedLines>
          </li>
        ))}
      </ul>
    </FoldedLines>
  );
}
