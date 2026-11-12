"use client";

import type { JSX } from "react";

import { Download } from "lucide-react";

import { pullCurve } from "@/actions/inflation";
import { Button } from "@/components/kit/button";
import { inflationOf } from "@/data/inflation";
import { useSender } from "@/hooks/use-sender";
import { formatPercent } from "@/lib/money";
import { formatDay } from "@/lib/months";

// The button pulling the Bank of England's latest implied inflation
// curve. The pull spins while it is on its way, and the store's answer
// draws the screen again from the curve kept, with a toast saying what
// it derives, or says why under a toast when the Bank or its file is
// refused.
export function CurvePull(): JSX.Element {
  const { isSending: isPulling, send } = useSender();

  function pull(): void {
    send(pullCurve, {
      failure: "Curve not pulled",
      success: (pulled) => ({
        description: `As at ${formatDay(pulled.asOf)}, derived inflation ${formatPercent(inflationOf(pulled).rate)}`,
        title: "Curve pulled",
      }),
    });
  }

  return (
    <Button isBusy={isPulling} onClick={pull} size="sm" variant="outline">
      <Download aria-hidden />
      Pull latest curve
    </Button>
  );
}
