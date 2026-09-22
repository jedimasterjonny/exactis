import type { DragEvent, KeyboardEvent } from "react";

import { useState } from "react";

// What the caller gets back: the row on the move and the row it is over,
// for the rows to mark themselves by, and the five things a grip and a
// row are wired to. The events are any element's, so a grip may be a
// button in a table row or in a list item, and a target either.
interface Reorder<TRow> {
  readonly dragOver: (event: DragEvent<HTMLElement>, target: TRow) => void;
  readonly drop: (target: TRow) => void;
  readonly moving: null | TRow;
  readonly over: null | TRow;
  readonly pickUp: (event: DragEvent<HTMLElement>, row: TRow) => void;
  readonly settle: () => void;
  readonly step: (event: KeyboardEvent<HTMLElement>, index: number) => void;
}

// The reordering the account table held for its grips, lifted out as it
// was so the rows can be put in order somewhere other than the table:
// a grip dragged onto another row, or moved a row up or down with the
// arrow keys, reports the row and the row it takes the place of, and
// the caller decides what the order means. The drag is held as state
// rather than on the event, so what is on the move and what it is over
// are known while the pointer is still between them. The rows are the
// caller's shape, constrained only to have an id, since the id is how a
// row is told from the one it is dropped on.
export function useReorder<TRow extends { readonly id: number }>(
  rows: readonly TRow[],
  onMove: (row: TRow, target: TRow) => void,
): Reorder<TRow> {
  const [moving, setMoving] = useState<null | TRow>(null);
  const [over, setOver] = useState<null | TRow>(null);

  // The row dropped on takes the drop, whichever row it was; a drop on
  // the row on the move, or with nothing on the move, is nothing.
  function drop(target: TRow): void {
    if (moving !== null && moving.id !== target.id) {
      onMove(moving, target);
    }
    settle();
  }

  // A row is over another only while a drag crosses it; the browser
  // takes a drop only where the drag over was claimed.
  function dragOver(event: DragEvent<HTMLElement>, target: TRow): void {
    if (moving !== null) {
      event.preventDefault();
      setOver(target);
    }
  }

  // Firefox starts no drag without data on the event, so the id goes on
  // it, though the state is what the drop reads.
  function pickUp(event: DragEvent<HTMLElement>, row: TRow): void {
    event.dataTransfer.setData("text/plain", String(row.id));
    setMoving(row);
  }

  function settle(): void {
    setMoving(null);
    setOver(null);
  }

  // The arrow keys move the row one place, taking the place of the row
  // above or below; at either end there is nothing to take, and any
  // other key is the grip's own.
  function step(event: KeyboardEvent<HTMLElement>, index: number): void {
    const row = rows[index];
    const target = rows[index + stepOf(event.key)];
    if (row !== undefined && target !== undefined && target.id !== row.id) {
      event.preventDefault();
      onMove(row, target);
    }
  }

  return { dragOver, drop, moving, over, pickUp, settle, step };
}

// The place each arrow key moves a row by, and none for any other key.
function stepOf(key: string): number {
  switch (key) {
    case "ArrowDown":
      return 1;
    case "ArrowUp":
      return -1;
    default:
      return 0;
  }
}
