"use client";

import type { JSX } from "react";

import { RefreshCw } from "lucide-react";

import { syncTargetsFromPortfolio } from "@/actions/targets";
import { Button } from "@/components/kit/button";
import { useSender } from "@/hooks/use-sender";
import { formatDay } from "@/lib/months";

interface PortfolioSyncProps {
  readonly branch: null | string;
  readonly describedBy?: string | undefined;
  readonly isDisabled?: boolean;
  readonly variant?: "default" | "outline";
}

// The button syncing the target allocation from the household's stored
// .portfolio file. It spins while the sync runs, moves focus to the
// screen's heading once accepted so focus never drops to the body if
// the button unmounts on refresh, and reports the synced date or a
// refusal under a toast.
export function PortfolioSync({
  branch,
  describedBy,
  isDisabled = false,
  variant = "outline",
}: PortfolioSyncProps): JSX.Element {
  const { isSending: isSyncing, send } = useSender();

  function sync(): void {
    send(async () => syncTargetsFromPortfolio(branch), {
      failure: "Allocation not synced",
      onAccepted: () => {
        document.querySelector<HTMLElement>("h1")?.focus();
      },
      success: (synced) => ({
        description: `From Portfolio, as at ${formatDay(synced.importedOn)}`,
        title: "Target allocation synced",
      }),
    });
  }

  return (
    <Button
      aria-describedby={isDisabled ? describedBy : undefined}
      disabled={isDisabled}
      isBusy={isSyncing}
      onClick={sync}
      size="sm"
      variant={variant}
    >
      <RefreshCw aria-hidden />
      Sync from Portfolio
    </Button>
  );
}
