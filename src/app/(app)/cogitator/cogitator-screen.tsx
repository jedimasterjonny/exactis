"use client";

import type { JSX } from "react";

import { FolderSync } from "lucide-react";
import { useState } from "react";

import type { Targets } from "@/data/targets";

import {
  CountField,
  MoneyField,
} from "@/components/app/molecules/figure-field";
import { SelectField } from "@/components/app/molecules/select-field";
import { Screen } from "@/components/app/templates/screen";
import { Badge } from "@/components/kit/badge";
import { formatGbp } from "@/lib/money";
import { formatDay } from "@/lib/months";
import { cogitator, sectionLabel } from "@/lib/nav";

import { CogitatorBoard } from "./cogitator-board";

interface CogitatorScreenProps {
  readonly bonds?: { readonly now: number; readonly targeted: number };
  readonly targets: null | Targets;
}

// The next best trades for the pounds typed in the header. The header
// says when the targets were imported and what they hold in all, and
// takes the amount to invest and the most sales to make once there is
// something to buy toward, the sales held to a few, since every
// choice of them is tried; and, once the allocation says what each
// securities account holds, which account the trades are placed in,
// all of them until one is chosen, the accounts listed by name. All
// three are the screen's own and forgotten when it is left, since
// they are chosen afresh at each visit to the broker, so they are
// held here, beside the route, where both the header that takes them
// and the board beneath that lays out the trades for them can reach
// them. All accounts is the choice of no name, so an account read
// from a file with none is not offered. An account chosen that the
// allocation no longer lists, as one does once a scenario with
// another is opened, which keeps the screen, is all accounts again,
// and stays so should it be listed again, as the choice by then
// shows. The sales field shows the sales held, and the account choice
// opens on the account held, so each says what the ladder is making
// when it comes back after the allocation had nothing to buy toward.
export function CogitatorScreen({
  bonds,
  targets,
}: CogitatorScreenProps): JSX.Element {
  const [amount, setAmount] = useState(0);
  const [sales, setSales] = useState(0);
  const [account, setAccount] = useState("");
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
          <>
            <MoneyField
              defaultValue={0}
              label="Amount to invest"
              min={0}
              onValueCommitted={setAmount}
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
          </>
        ) : undefined
      }
      label={sectionLabel(cogitator)}
      meta={
        targets === null ? undefined : (
          <>
            <Badge variant="secondary">
              <FolderSync aria-hidden />
              {`Imported ${formatDay(targets.importedOn)}`}
            </Badge>
            {`${formatGbp(held)} held`}
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
