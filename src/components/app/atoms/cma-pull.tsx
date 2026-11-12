"use client";

import type { JSX } from "react";

import { Download } from "lucide-react";

import { pullCma } from "@/actions/cma";
import { Button } from "@/components/kit/button";
import { vintageName } from "@/data/cma";
import { useSender } from "@/hooks/use-sender";
import { formatDay } from "@/lib/months";

// The button pulling BlackRock's workbook of capital market assumptions.
// The pull spins while it is on its way, and the store's answer draws
// the screen again from the vintage kept, under a toast saying which
// vintage and the day its data are as of, or says why under a toast
// when BlackRock or its workbook is refused.
export function CmaPull(): JSX.Element {
  const { isSending: isPulling, send: sendPull } = useSender();

  function pull(): void {
    sendPull(pullCma, {
      failure: "CMA not pulled",
      success: (pulled) => ({
        description: `${vintageName(pulled)}, data as of ${formatDay(pulled.asOf)}`,
        title: "CMA pulled",
      }),
    });
  }

  return (
    <Button isBusy={isPulling} onClick={pull} size="sm" variant="outline">
      <Download aria-hidden />
      Pull CMA workbook
    </Button>
  );
}
