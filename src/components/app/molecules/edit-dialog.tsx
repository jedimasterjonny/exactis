import type { JSX, ReactNode } from "react";

import { Button } from "@/components/kit/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/kit/dialog";

interface EditDialogProps {
  readonly canSave?: boolean;
  readonly children: ReactNode;
  readonly eyebrow: string;
  readonly isWide?: boolean;
  readonly onDismiss: () => void;
  readonly onSave: () => void;
  readonly title: string;
}

// The dialog every editor in the product opens: an eyebrow in the brand
// colour saying what is being entered or edited, the title naming it, the
// fields the caller gives, and Cancel and Save beneath. It is open for as
// long as it is mounted, so a caller renders it while it holds an entry
// and not otherwise, and the fields inside mount fresh with each entry.
// The dialog opens only from a button, so the only change it can report
// is a close: Cancel, Escape or a press outside, all of which dismiss.
// Save holds while the caller says the draft cannot be saved, unnamed or
// on its way to the store. A wide dialog fits a form of three columns.
export function EditDialog({
  canSave = true,
  children,
  eyebrow,
  isWide = false,
  onDismiss,
  onSave,
  title,
}: EditDialogProps): JSX.Element {
  return (
    <Dialog onOpenChange={onDismiss} open>
      <DialogContent className={isWide ? "sm:max-w-lg" : undefined}>
        <DialogHeader>
          <span className="label text-brand">{eyebrow}</span>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
        <DialogFooter>
          <DialogClose render={<Button size="sm" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button disabled={!canSave} onClick={onSave} size="sm">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
