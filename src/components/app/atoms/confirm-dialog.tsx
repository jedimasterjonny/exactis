import type { JSX, ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/kit/alert-dialog";

interface ConfirmDialogProps {
  readonly children: ReactNode;
  readonly confirm?: string;
  readonly isBusy?: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly title: string;
}

// The dialog every deletion in the product asks through: the title
// naming what is about to go, the caller's words on what goes with it,
// and Cancel and a destructive confirm beneath. It is open for as long
// as it is mounted, so a caller renders it while it holds something to
// ask about and not otherwise. An alert dialog closes only from its
// buttons, never from a press outside, so the only change it can report
// is Cancel or Escape, both of which cancel. The confirm spins while
// the caller says the deletion is on its way to the store. It says
// Delete unless the caller names what it does, for a question whose
// answer writes over something rather than deleting it.
export function ConfirmDialog({
  children,
  confirm = "Delete",
  isBusy = false,
  onCancel,
  onConfirm,
  title,
}: ConfirmDialogProps): JSX.Element {
  return (
    <AlertDialog onOpenChange={onCancel} open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{children}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="sm">Cancel</AlertDialogCancel>
          <AlertDialogAction
            isBusy={isBusy}
            onClick={onConfirm}
            size="sm"
            variant="destructive"
          >
            {confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
