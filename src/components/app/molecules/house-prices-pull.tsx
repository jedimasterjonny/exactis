"use client";

import type { JSX } from "react";

import { Download } from "lucide-react";

import { pullHousePrices } from "@/actions/house-prices";
import { Button } from "@/components/kit/button";
import { useSender } from "@/hooks/use-sender";
import { formatGbp } from "@/lib/money";
import { formatMonthShort } from "@/lib/months";

// The progress header's button, which pulls the Land Registry's house
// price index and has the house written into the points off it, and its
// balance set. The pull spins while it is on its way, and the store's
// answer draws the screen again from the points written, with a toast
// saying what the house is now worth, since the pull wrote over the
// value typed, and which month the index ran to, since the months after
// it are rolled forward and the reader should know from where; or says
// why under a toast when the Registry or its answer is refused.
export function HousePricesPull(): JSX.Element {
  const { isSending: isPulling, send } = useSender();

  function pull(): void {
    send(pullHousePrices, {
      failure: "House prices not pulled",
      success: (pulled) => ({
        description: `${pulled.name} now ${formatGbp(pulled.worth)}; index to ${formatMonthShort(pulled.to)}, the months after rolled forward from it`,
        title: "House prices pulled",
      }),
    });
  }

  return (
    <Button isBusy={isPulling} onClick={pull} size="sm" variant="outline">
      <Download aria-hidden />
      Pull house prices
    </Button>
  );
}
