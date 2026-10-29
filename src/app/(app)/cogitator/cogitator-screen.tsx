"use client";

import type { JSX } from "react";

import { FolderSync } from "lucide-react";
import { useState } from "react";

import type { Targets } from "@/data/targets";

import {
  CountField,
  MoneyField,
} from "@/components/app/molecules/figure-field";
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
// something to buy toward, the sales held to a few, since every choice
// of them is tried. Both are the screen's own and forgotten when it is
// left, since they are typed afresh at each visit to the broker, so
// they are held here, beside the route, where both the header that
// takes them and the board beneath that lays out the trades for them
// can reach them. The sales field shows the sales held, so it says what
// the ladder is making when it comes back after the allocation had
// nothing to buy toward.
export function CogitatorScreen({
  bonds,
  targets,
}: CogitatorScreenProps): JSX.Element {
  const [amount, setAmount] = useState(0);
  const [sales, setSales] = useState(0);
  const categories = targets?.categories ?? [];
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
