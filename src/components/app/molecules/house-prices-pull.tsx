"use client";

import type { JSX } from "react";

import { Download } from "lucide-react";
import { useId } from "react";

import { pullHousePrices } from "@/actions/house-prices";
import { Button } from "@/components/kit/button";
import { useSender } from "@/hooks/use-sender";
import { formatGbp } from "@/lib/money";
import { formatMonthShort } from "@/lib/months";

interface HousePricesPullProps {
  readonly isInScenario: boolean;
}

// The progress header's button, which pulls the Land Registry's house
// price index and has the house written into the points off it, and its
// balance set. The pull spins while it is on its way, and the store's
// answer draws the screen again from the points written, with a toast
// saying what the house is now worth, since the pull wrote over the
// value typed, and which month the index ran to, since the months after
// it are rolled forward and the reader should know from where; or says
// why under a toast when the Registry or its answer is refused. While a
// scenario is open the pull is held, since the action refuses it there,
// and a sentence before the button says why, as text in reading order,
// since a disabled button takes no focus, and as the button's
// description, for whoever reaches it by its role.
export function HousePricesPull({
  isInScenario,
}: HousePricesPullProps): JSX.Element {
  const { isSending: isPulling, send } = useSender();
  const heldId = useId();

  function pull(): void {
    send(pullHousePrices, {
      failure: "House prices not pulled",
      success: (pulled) => ({
        description: `${pulled.name} now ${formatGbp(pulled.worth)}, indexed to ${formatMonthShort(pulled.to)}`,
        title: "House prices pulled",
      }),
    });
  }

  return (
    <>
      {isInScenario && (
        <span className="text-sm text-pretty text-muted-foreground" id={heldId}>
          Leave the scenario to pull house prices.
        </span>
      )}
      <Button
        aria-describedby={isInScenario ? heldId : undefined}
        disabled={isInScenario}
        isBusy={isPulling}
        onClick={pull}
        size="sm"
        variant="outline"
      >
        <Download aria-hidden />
        Pull house prices
      </Button>
    </>
  );
}
