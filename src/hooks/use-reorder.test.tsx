import type { JSX } from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Table, TableBody, TableCell, TableRow } from "@/components/kit/table";

import { useReorder } from "./use-reorder";

type Move = (row: Row, target: Row) => void;

// A row of the shape every reordered one is: carrying the id a row is
// told from its target by, with a name to find it by beside it.
interface Row {
  readonly id: number;
  readonly name: string;
}

const rows: readonly Row[] = [
  { id: 1, name: "Pension" },
  { id: 2, name: "ISA" },
  { id: 3, name: "Cash" },
];

const [pension, isa, cash] = rows;

// The hook wired as a caller wires it, so the test drives it through
// real events: each row a target, the button in it a grip, and the
// hook's state marked on the row as it stands, the row on the move over
// itself included.
function Rows({ onMove }: { readonly onMove: Move }): JSX.Element {
  const { dragOver, drop, moving, over, pickUp, settle, step } = useReorder(
    rows,
    onMove,
  );
  return (
    <Table>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow
            data-moving={moving?.id === row.id ? "" : undefined}
            data-over={over?.id === row.id ? "" : undefined}
            key={row.id}
            onDragOver={(event) => {
              dragOver(event, row);
            }}
            onDrop={() => {
              drop(row);
            }}
          >
            <TableCell>
              <button
                draggable
                onDragEnd={settle}
                onDragStart={(event) => {
                  pickUp(event, row);
                }}
                onKeyDown={(event) => {
                  step(event, index);
                }}
                type="button"
              >
                {row.name}
              </button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

describe("useReorder", () => {
  // jsdom carries no data on a drag event, so the test hands the pick-up
  // the transfer it writes the id to. A drag over is claimed, and so
  // cancelled, only while something is on the move.
  it("reports a row dropped on another, and settles once it has", () => {
    const onMove = vi.fn<Move>();
    const setData = vi.fn();
    render(<Rows onMove={onMove} />);

    const pensionRow = screen.getByRole("row", { name: "Pension" });
    const cashRow = screen.getByRole("row", { name: "Cash" });

    expect(fireEvent.dragOver(cashRow)).toBe(true);
    expect(cashRow).not.toHaveAttribute("data-over");

    fireEvent.dragStart(screen.getByRole("button", { name: "Pension" }), {
      dataTransfer: { setData },
    });

    expect(setData).toHaveBeenCalledExactlyOnceWith("text/plain", "1");
    expect(pensionRow).toHaveAttribute("data-moving", "");
    expect(fireEvent.dragOver(cashRow)).toBe(false);
    expect(cashRow).toHaveAttribute("data-over", "");

    fireEvent.drop(cashRow);

    expect(onMove).toHaveBeenCalledExactlyOnceWith(pension, cash);
    expect(pensionRow).not.toHaveAttribute("data-moving");
    expect(cashRow).not.toHaveAttribute("data-over");
  });

  it("reports nothing for a drop on the row on the move, or with none on the move, and settles a drag that ends elsewhere", () => {
    const onMove = vi.fn<Move>();
    render(<Rows onMove={onMove} />);

    const pensionRow = screen.getByRole("row", { name: "Pension" });
    const isaRow = screen.getByRole("row", { name: "ISA" });
    const grip = screen.getByRole("button", { name: "Pension" });

    fireEvent.drop(isaRow);
    fireEvent.dragStart(grip, { dataTransfer: { setData: vi.fn() } });
    fireEvent.dragOver(pensionRow);
    fireEvent.drop(pensionRow);

    expect(onMove).not.toHaveBeenCalled();

    fireEvent.dragStart(grip, { dataTransfer: { setData: vi.fn() } });
    fireEvent.dragOver(isaRow);
    fireEvent.dragEnd(grip);

    expect(pensionRow).not.toHaveAttribute("data-moving");
    expect(isaRow).not.toHaveAttribute("data-over");
    expect(onMove).not.toHaveBeenCalled();
  });

  // A step that moves a row takes the key from the grip, so an arrow
  // does not also scroll the page; one that moves nothing leaves it.
  it("moves a row up or down a place from the keyboard, and not past either end", () => {
    const onMove = vi.fn<Move>();
    render(<Rows onMove={onMove} />);

    const grip = screen.getByRole("button", { name: "ISA" });

    expect(fireEvent.keyDown(grip, { key: "ArrowUp" })).toBe(false);
    expect(fireEvent.keyDown(grip, { key: "ArrowDown" })).toBe(false);
    expect(fireEvent.keyDown(grip, { key: "Enter" })).toBe(true);
    expect(
      fireEvent.keyDown(screen.getByRole("button", { name: "Pension" }), {
        key: "ArrowUp",
      }),
    ).toBe(true);
    expect(
      fireEvent.keyDown(screen.getByRole("button", { name: "Cash" }), {
        key: "ArrowDown",
      }),
    ).toBe(true);
    expect(onMove.mock.calls).toStrictEqual([
      [isa, pension],
      [isa, cash],
    ]);
  });
});
