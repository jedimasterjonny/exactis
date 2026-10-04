import type { JSX } from "react";

import { Pencil, Trash2 } from "lucide-react";

import { RowAction } from "@/components/app/atoms/row-action";
import { RowLock } from "@/components/app/atoms/row-lock";

interface RowActionsProps<TRow> {
  readonly deleteLock?: string | undefined;
  readonly name: string;
  readonly onDelete?: ((row: TRow) => void) | undefined;
  readonly onEdit?: ((row: TRow) => void) | undefined;
  readonly row: TRow;
}

// The pair a row ends with: a pencil that reports the row to edit and a
// bin beside it that reports the row to delete, each named after the row
// so a column of identical icons says which one it acts on. Which of the
// two appears is decided by which handler it was given, and given
// neither it draws nothing, so a caller threading an optional handler
// through passes it on rather than repeating the question. The bin takes
// the destructive tone, which is the one place in a row where what an
// action does is said before the dialog asks about it. The row goes back
// to the caller untouched, since the handler it came from is the one
// that knows what a row is; only its name is this component's business.
// A bin given a reason is held: a lock is drawn where it would be, so a
// column of pairs stays a column, named with the reason, for a row the
// store would refuse to delete and whose caller can say why before it is
// asked. A disabled bin with the reason as its title said it to nobody,
// since a disabled button takes neither the pointer nor the focus; the
// lock is the one the plan's locked rows draw, which a screen reader
// reads the reason off.
export function RowActions<TRow>({
  deleteLock,
  name,
  onDelete,
  onEdit,
  row,
}: RowActionsProps<TRow>): JSX.Element | null {
  if (onEdit === undefined && onDelete === undefined) {
    return null;
  }

  return (
    <span className="flex gap-1">
      {onEdit !== undefined && (
        <RowAction
          icon={Pencil}
          name={`Edit ${name}`}
          onClick={() => {
            onEdit(row);
          }}
        />
      )}
      {onDelete !== undefined && deleteLock !== undefined && (
        <span className="inline-flex size-7 items-center justify-center">
          <RowLock reason={deleteLock} />
        </span>
      )}
      {onDelete !== undefined && deleteLock === undefined && (
        <RowAction
          icon={Trash2}
          name={`Delete ${name}`}
          onClick={() => {
            onDelete(row);
          }}
          tone="destructive"
        />
      )}
    </span>
  );
}
