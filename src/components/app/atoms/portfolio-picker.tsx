"use client";

import type { ChangeEvent, JSX } from "react";

import { FolderOpen } from "lucide-react";
import { useRef } from "react";

import type { PortfolioSnapshot } from "@/data/portfolio";

import { Button } from "@/components/kit/button";
import { useSender } from "@/hooks/use-sender";
import { saved } from "@/lib/answer";
import { readPortfolioSnapshot } from "@/lib/portfolio-file";

interface PortfolioPickerProps {
  readonly label: string;
  readonly onOpened: (snapshot: PortfolioSnapshot) => void;
  readonly variant?: "default" | "outline";
}

// The file picker that opens a binary Portfolio Performance (.portfolio)
// file in the browser and hands the parsed snapshot back to the screen.
// Nothing leaves the device. The button spins while the file is read,
// surfaces any refusal or read failure under an error toast, and clears
// the hidden input immediately so picking the same file again after
// saving changes reads it afresh.
export function PortfolioPicker({
  label,
  onOpened,
  variant = "outline",
}: PortfolioPickerProps): JSX.Element {
  const pickerRef = useRef<HTMLInputElement>(null);
  const { isSending: isOpening, send } = useSender();

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
        return saved(readPortfolioSnapshot(bytes, file.name));
      },
      { failure: "Portfolio file not opened", onAccepted: onOpened },
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
        isBusy={isOpening}
        onClick={() => {
          pickerRef.current?.click();
        }}
        size="sm"
        variant={variant}
      >
        <FolderOpen aria-hidden />
        {label}
      </Button>
    </>
  );
}
