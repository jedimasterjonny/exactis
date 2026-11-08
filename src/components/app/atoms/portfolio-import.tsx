"use client";

import type { ChangeEvent, JSX } from "react";

import { Upload } from "lucide-react";
import { useRef } from "react";

import { importTargets } from "@/actions/targets";
import { Button } from "@/components/kit/button";
import { useSender } from "@/hooks/use-sender";
import { formatDay } from "@/lib/months";
import { readPortfolios, readTargets } from "@/lib/portfolio-file";

// The button importing the holdings, on the month end and the
// cogitator, the target allocation with what each category holds and
// each securities account's cash and what was paid into it, from a
// Portfolio Performance file chosen on this device, as the assumptions
// screen imports them, so the trades are worked out over the holdings
// as they stand at the close.
// The file is read here in the browser and the store is sent what the
// reader reads out of it alone. The import spins while the file is read
// and the store asked, and the store's answer draws the screen again,
// under a toast, or says why under a toast. The picker is emptied as
// soon as a file is taken from it, so the same file chosen again, saved
// since, is read again.
export function PortfolioImport(): JSX.Element {
  const pickerRef = useRef<HTMLInputElement>(null);
  const { isSending: isImporting, send } = useSender();

  function take(event: ChangeEvent<HTMLInputElement>): void {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (file === undefined) {
      return;
    }
    send(
      async () => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        return importTargets(readTargets(bytes), readPortfolios(bytes));
      },
      {
        failure: "Holdings not imported",
        success: (imported) => ({
          description: `As at ${formatDay(imported.importedOn)}`,
          title: "Holdings imported",
        }),
      },
    );
  }

  return (
    <>
      <input
        accept=".portfolio"
        aria-label="Portfolio Performance file"
        className="hidden"
        onChange={take}
        ref={pickerRef}
        type="file"
      />
      <Button
        isBusy={isImporting}
        onClick={() => {
          pickerRef.current?.click();
        }}
        size="sm"
        variant="outline"
      >
        <Upload aria-hidden />
        Import from Portfolio Performance
      </Button>
    </>
  );
}
