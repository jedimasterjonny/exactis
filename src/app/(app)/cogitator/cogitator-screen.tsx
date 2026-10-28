"use client";

import type { JSX } from "react";

import { FolderSync } from "lucide-react";
import { useState } from "react";

import type { Targets } from "@/data/targets";

import { MoneyField } from "@/components/app/molecules/figure-field";
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
// takes the amount to invest once there is something to buy toward. The
// amount is the screen's own and forgotten when it is left, since it is
// typed afresh at each visit to the broker, so it is held here, beside
// the route, where both the header that takes it and the board beneath
// that lays out the trades for it can reach it.
export function CogitatorScreen({
  bonds,
  targets,
}: CogitatorScreenProps): JSX.Element {
  const [amount, setAmount] = useState(0);
  const categories = targets?.categories ?? [];
  const held = categories.reduce((sum, { value }) => sum + value, 0);
  const isReady =
    held > 0 &&
    categories.some(({ isImplemented, share }) => isImplemented && share > 0);
  return (
    <Screen
      actions={
        isReady ? (
          <MoneyField
            defaultValue={0}
            label="Amount to invest"
            min={0}
            onValueCommitted={setAmount}
          />
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
        targets={targets}
      />
    </Screen>
  );
}
