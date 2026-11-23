"use client";

import type { ChangeEvent, JSX } from "react";

import { Upload } from "lucide-react";
import { startTransition, useRef, useState } from "react";

import { uploadPortfolio } from "@/actions/portfolio";
import { ConfirmDialog } from "@/components/app/molecules/confirm-dialog";
import { Button } from "@/components/kit/button";
import { toast } from "@/components/kit/toast";
import { maxPortfolioBytes, portfolioTooLarge } from "@/data/portfolio";
import { useSender } from "@/hooks/use-sender";

interface ChosenFile {
  readonly current: string;
  readonly file: File;
  readonly forVersion: number;
}

interface PortfolioUploadProps {
  readonly currentFileName?: string | undefined;
  readonly describedBy?: string | undefined;
  readonly hasPreview?: boolean;
  readonly isDisabled?: boolean;
  readonly version: number;
}

// Uploads or replaces the household's stored binary .portfolio file.
// Initial upload (when no file is stored yet) uploads immediately on
// selection; replacing an existing file confirms through ConfirmDialog,
// bound to the version open when the file was chosen so an external
// version advance unmounts the modal rather than overwriting an unseen
// file. Files larger than maxPortfolioBytes are refused immediately on
// selection before opening ConfirmDialog or sending. Server refusals
// close the dialog alongside the error toast so the user is never stuck
// in a modal with an unreadable file; only thrown network/server errors
// leave it open for retry.
export function PortfolioUpload({
  currentFileName,
  describedBy,
  hasPreview = false,
  isDisabled = false,
  version,
}: PortfolioUploadProps): JSX.Element {
  const pickerRef = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<ChosenFile | null>(null);
  const { isSending, send } = useSender();
  const isReplacing = currentFileName !== undefined;
  const pending =
    !isDisabled && chosen !== null && chosen.forVersion === version
      ? chosen
      : null;

  const close = (): void => {
    setChosen(null);
  };

  function upload(file: File, afterVersion: number): void {
    const formData = new FormData();
    formData.set("afterVersion", String(afterVersion));
    formData.set("file", file);
    send(
      async () => {
        const answer = await uploadPortfolio(formData);
        if (answer.kind === "refused") {
          startTransition(() => {
            setChosen(null);
          });
        }
        return answer;
      },
      {
        failure: isReplacing
          ? "Portfolio file not replaced"
          : "Portfolio file not uploaded",
        onAccepted: close,
        success: () =>
          isReplacing
            ? {
                description: "Kept as the next version for the household",
                title: "Portfolio file replaced",
              }
            : {
                description: "Stored with the household",
                title: "Portfolio file uploaded",
              },
      },
    );
  }

  function take(event: ChangeEvent<HTMLInputElement>): void {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (file === undefined) {
      return;
    }
    if (file.size > maxPortfolioBytes) {
      toast.add({
        description: portfolioTooLarge,
        title: isReplacing
          ? "Portfolio file not replaced"
          : "Portfolio file not uploaded",
        type: "error",
      });
      return;
    }
    if (currentFileName !== undefined) {
      setChosen({ current: currentFileName, file, forVersion: version });
      return;
    }
    upload(file, version);
  }

  return (
    <>
      <input
        accept=".portfolio"
        aria-label="Portfolio Performance file"
        className="hidden"
        disabled={isDisabled || isSending}
        onChange={take}
        ref={pickerRef}
        type="file"
      />
      <Button
        aria-describedby={describedBy}
        disabled={isDisabled}
        isBusy={isSending}
        onClick={() => {
          pickerRef.current?.click();
        }}
        size="sm"
        variant={isReplacing ? "outline" : "default"}
      >
        <Upload aria-hidden />
        {isReplacing ? "Replace file…" : "Upload .portfolio file"}
      </Button>
      {pending !== null && (
        <ConfirmDialog
          confirm="Replace"
          isBusy={isSending}
          onCancel={close}
          onConfirm={() => {
            upload(pending.file, pending.forVersion);
          }}
          title="Replace portfolio file?"
        >
          <span className="wrap-anywhere">
            {replaceMessage(pending.file.name, pending.current, hasPreview)}
          </span>
        </ConfirmDialog>
      )}
    </>
  );
}

function replaceMessage(
  incoming: string,
  current: string,
  hasPreview: boolean,
): string {
  const subject = incoming === current ? "This" : incoming;
  const preview = hasPreview
    ? " Unsaved preview entries in this tab will be cleared."
    : "";
  return `${subject} replaces ${current} for the household, kept as the next version. Download .portfolio first to keep a copy of the current file.${preview}`;
}
