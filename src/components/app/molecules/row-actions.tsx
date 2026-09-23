import type { JSX } from "react";

import { Pencil, Trash2 } from "lucide-react";

import { RowAction } from "@/components/app/atoms/row-action";

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
// A bin given a reason is held: drawn where it always is, so a column
// of pairs stays a column, but disabled, with the reason as its title,
// for a row the store would refuse to delete and whose caller can say
// why before it is asked.
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
      {onDelete !== undefined && (
        <RowAction
          disabled={deleteLock !== undefined}
          icon={Trash2}
          name={`Delete ${name}`}
          onClick={() => {
            onDelete(row);
          }}
          title={deleteLock}
          tone="destructive"
        />
      )}
    </span>
  );
}
