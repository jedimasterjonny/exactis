import type { JSX, ReactNode } from "react";

import { Trash2 } from "lucide-react";

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
  readonly isSaving?: boolean;
  readonly isWide?: boolean;
  readonly onDelete?: (() => void) | undefined;
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
// A dialog given a delete handler offers a Delete as well, set apart from
// the other two, at the footer's far edge beside them and beneath them
// on a phone, where the footer stacks: it reports the press and no more,
// so the caller asks through its confirm before anything goes, as it
// would from a row's bin. Given none, as an entry of something new is,
// it offers nothing to delete. The Delete holds while the caller says a
// save is on its way to the store, as Save does, since a deletion asked
// for over a save in flight would race it: the save's answer could
// report the record saved after the question had deleted it.
export function EditDialog({
  canSave = true,
  children,
  eyebrow,
  isSaving = false,
  isWide = false,
  onDelete,
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
          {onDelete !== undefined && (
            <Button
              className="sm:mr-auto"
              disabled={isSaving}
              onClick={onDelete}
              size="sm"
              variant="destructive"
            >
              <Trash2 aria-hidden />
              Delete
            </Button>
          )}
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
