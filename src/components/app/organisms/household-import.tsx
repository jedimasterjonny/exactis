"use client";

import type { JSX } from "react";

import { Upload } from "lucide-react";
import { useRef, useState } from "react";

import { importHousehold } from "@/actions/household";
import { FooterAction } from "@/components/app/atoms/footer-action";
import { ConfirmDialog } from "@/components/app/molecules/confirm-dialog";
import { useSender } from "@/hooks/use-sender";

// The sidebar footer's import: a household file, as the export hands one
// out, chosen on this device and kept as the next version of what is
// open, asked first, since it replaces the household or the scenario
// open whole and nothing on screen restores a version saved before it,
// so the question points to the export. The banner above every screen
// says which is open, so the question and its toasts do not. The file is
// held once chosen and read when the import is confirmed, so a file that
// cannot be read is said why under the toast an import is, and a cancel
// reads nothing. The picker is emptied as soon as a file is taken from
// it, so the same file chosen again is read again. The confirm spins
// while the import is on its way, and the store's answer draws the
// screen again from the version kept, under a toast; a refusal is said
// in its own words and leaves the question open. The button is drawn as
// sign-out's is, below the export.
export function HouseholdImport(): JSX.Element {
  const pickerRef = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<File | null>(null);
  const { isSending, send } = useSender();
  const close = (): void => {
    setChosen(null);
  };

  return (
    <>
      <input
        accept="application/json,.json"
        aria-label="Household file"
        className="hidden"
        onChange={(event) => {
          const input = event.currentTarget;
          setChosen(input.files?.[0] ?? null);
          input.value = "";
        }}
        ref={pickerRef}
        type="file"
      />
      <FooterAction
        onClick={() => {
          pickerRef.current?.click();
        }}
      >
        <Upload aria-hidden />
        Import file…
      </FooterAction>
      {chosen !== null && (
        <ConfirmDialog
          confirm="Import"
          isBusy={isSending}
          onCancel={close}
          onConfirm={() => {
            send(async () => importHousehold(await chosen.text()), {
              failure: "File not imported",
              onAccepted: close,
              success: () => ({
                description: "Kept as the next version of what is open",
                title: "File imported",
              }),
            });
          }}
          title="Import this file?"
        >
          What is open is replaced by the file, kept as the next version. Export
          first to keep a copy of what is open.
        </ConfirmDialog>
      )}
    </>
  );
}
