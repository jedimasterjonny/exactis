import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RowActions } from "./row-actions";

// A row of whatever shape the caller keeps: the pair reports it back
// unread, so anything with a name will do.
const row = { id: 1, name: "Mortgage" };

describe("RowActions", () => {
  it("names both actions after the row and reports the row each acts on", () => {
    const onDelete = vi.fn<(deleted: typeof row) => void>();
    const onEdit = vi.fn<(edited: typeof row) => void>();
    render(
      <RowActions
        name={row.name}
        onDelete={onDelete}
        onEdit={onEdit}
        row={row}
      />,
    );

    const bin = screen.getByRole("button", { name: "Delete Mortgage" });

    expect(bin).toHaveClass("hover:text-destructive");

    fireEvent.click(screen.getByRole("button", { name: "Edit Mortgage" }));
    fireEvent.click(bin);

    expect(onEdit).toHaveBeenCalledExactlyOnceWith(row);
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(row);
  });

  it("draws only the pencil when it is given only an edit handler", () => {
    render(
      <RowActions
        name={row.name}
        onEdit={vi.fn<(edited: typeof row) => void>()}
        row={row}
      />,
    );

    expect(screen.getByRole("button", { name: "Edit Mortgage" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Delete Mortgage" }),
    ).not.toBeInTheDocument();
  });

  it("draws only the bin when it is given only a delete handler", () => {
    render(
      <RowActions
        name={row.name}
        onDelete={vi.fn<(deleted: typeof row) => void>()}
        row={row}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Delete Mortgage" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Edit Mortgage" }),
    ).not.toBeInTheDocument();
  });

  it("draws nothing at all when it is given neither handler", () => {
    const { container } = render(<RowActions name={row.name} row={row} />);

    expect(container).toBeEmptyDOMElement();
  });

  // A bin given a reason stays where it is, so the column of pairs holds,
  // but is disabled and says why, and a press reports nothing.
  it("holds the bin when given a reason, and says it", () => {
    const onDelete = vi.fn<(deleted: typeof row) => void>();
    render(
      <RowActions
        deleteLock="Pay it off first"
        name={row.name}
        onDelete={onDelete}
        onEdit={vi.fn<(edited: typeof row) => void>()}
        row={row}
      />,
    );

    const bin = screen.getByRole("button", { name: "Delete Mortgage" });

    expect(bin).toBeDisabled();
    expect(bin).toHaveAttribute("title", "Pay it off first");
    expect(screen.getByRole("button", { name: "Edit Mortgage" })).toBeEnabled();

    fireEvent.click(bin);

    expect(onDelete).not.toHaveBeenCalled();
  });
});
