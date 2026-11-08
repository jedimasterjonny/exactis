"use client";

import type { JSX } from "react";

import { FolderSync } from "lucide-react";
import { useState } from "react";

import type { Month } from "@/data/schedule";
import type { Targets } from "@/data/targets";

import { PortfolioImport } from "@/components/app/atoms/portfolio-import";
import {
  CountField,
  MoneyField,
} from "@/components/app/molecules/figure-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { Screen } from "@/components/app/templates/screen";
import { Badge } from "@/components/kit/badge";
import { formatGbp } from "@/lib/money";
import { formatDated, monthName } from "@/lib/months";
import { cogitator, sectionLabel } from "@/lib/nav";

import { CogitatorBoard } from "./cogitator-board";

interface CogitatorScreenProps {
  readonly bonds?: { readonly now: number; readonly targeted: number };
  readonly offered?: {
    readonly account?: string;
    readonly amount: number;
    readonly month: Month;
  };
  readonly planned?: { readonly amount: number; readonly month: Month };
  readonly targets: null | Targets;
  readonly today: string;
}

// The next best trades for the pounds typed in the header. The header
// says when the targets were imported and how long ago, on the day the
// page was drawn, and what they hold in all, beside the import that
// takes them afresh, as the month end's does, or that import alone
// before any are; and it takes the amount to invest and the most sales
// to make once there is something to buy toward, the sales held to a
// few, since every choice of them is tried; and, once the allocation
// says what each securities account holds, which account the trades are
// placed in, all of them until one is chosen, the accounts listed by
// name. All three are the screen's own and forgotten when it is left,
// since they are chosen afresh at each visit to the broker, so they are
// held here, beside the route, where both the header that takes them
// and the board beneath that lays out the trades for them can reach
// them. All accounts is the choice of no name, so an account read
// from a file with none is not offered. An account chosen that the
// allocation no longer lists, as one does once a scenario with
// another is opened, which keeps the screen, is all accounts again,
// and stays so should it be listed again, as the choice by then
// shows. The amount and sales fields show those held, and the account
// choice opens on the account held, so each says what the ladder is
// making when it comes back after the allocation had nothing to buy
// toward. An amount the month end offered opens the amount at it rather
// than at nothing, and the field says which month's close it came from
// for as long as it holds it, so a figure is never there unexplained;
// it is typed over as any amount is. Without an offer, what the plan
// pays into the ISAs and GIA in its first month opens the amount
// where the page hands it on, and the field says so, and for which
// month, the same way. One offered in an account opens the account
// choice on it, or on all accounts where the allocation does not list
// it.
export function CogitatorScreen({
  bonds,
  offered,
  planned,
  targets,
  today,
}: CogitatorScreenProps): JSX.Element {
  const [amount, setAmount] = useState(offered?.amount ?? planned?.amount ?? 0);
  const [sales, setSales] = useState(0);
  const [account, setAccount] = useState(offered?.account ?? "");
  const categories = targets?.categories ?? [];
  const accounts = [
    ...new Set(
      categories.flatMap((category) =>
        (category.accounts ?? []).map(({ name }) => name),
      ),
    ),
  ]
    .filter((name) => name !== "")
    .toSorted((one, other) => one.localeCompare(other));
  if (account !== "" && !accounts.includes(account)) {
    setAccount("");
  }
  const held = categories.reduce((sum, { value }) => sum + value, 0);
  const isReady =
    held > 0 &&
    categories.some(({ isImplemented, share }) => isImplemented && share > 0);
  return (
    <Screen
      actions={
        isReady ? (
          <div className="flex flex-wrap items-center gap-2">
            <MoneyField
              hint={hintOf(amount, offered, planned)}
              label="Amount to invest"
              min={0}
              onValueCommitted={setAmount}
              value={amount}
            />
            <CountField
              label="Sales at most"
              max={5}
              min={0}
              onValueCommitted={setSales}
              value={sales}
            />
            {accounts.length > 0 && (
              <SelectField
                defaultValue={account}
                label="Account"
                onValueChange={setAccount}
                options={[
                  { label: "All accounts", value: "" },
                  ...accounts.map((name) => ({ label: name, value: name })),
                ]}
              />
            )}
          </div>
        ) : undefined
      }
      label={sectionLabel(cogitator)}
      meta={
        targets === null ? (
          <PortfolioImport />
        ) : (
          <>
            <Badge variant="secondary">
              <FolderSync aria-hidden />
              {`Imported ${formatDated(targets.importedOn, today)}`}
            </Badge>
            {`${formatGbp(held)} held`}
            <PortfolioImport />
          </>
        )
      }
      title={cogitator.title}
    >
      <CogitatorBoard
        account={account}
        amount={amount}
        {...(bonds !== undefined && { bonds })}
        held={held}
        isReady={isReady}
        sales={sales}
        targets={targets}
      />
    </Screen>
  );
}

// What the amount field says of the figure it holds: the close it came
// from while it holds the month end's offer, the month the plan pays it
// into the ISAs and GIA in while it holds the plan's, and nothing once
// another is typed.
function hintOf(
  amount: number,
  offered: CogitatorScreenProps["offered"],
  planned: CogitatorScreenProps["planned"],
): string | undefined {
  if (offered?.amount === amount) {
    return `From ${monthName(offered.month.month, "long")}'s close`;
  }
  if (planned?.amount === amount) {
    return `Planned for the ISAs and GIA in ${monthName(planned.month.month, "long")}`;
  }
  return undefined;
}
