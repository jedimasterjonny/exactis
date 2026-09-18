import { fireEvent, render, screen } from "@testing-library/react";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { RowAction } from "./row-action";

describe("RowAction", () => {
  it("names the action after the row it acts on and reports a press", () => {
    const onClick = vi.fn<() => void>();
    render(<RowAction icon={Pencil} name="Edit Mortgage" onClick={onClick} />);

    const action = screen.getByRole("button", { name: "Edit Mortgage" });

    expect(action).toHaveClass("size-7");

    fireEvent.click(action);

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("takes the destructive tone and a class of the caller's", () => {
    render(
      <RowAction
        className="cursor-grab"
        icon={Trash2}
        name="Delete Mortgage"
        tone="destructive"
      />,
    );

    expect(screen.getByRole("button", { name: "Delete Mortgage" })).toHaveClass(
      "cursor-grab",
      "hover:text-destructive",
      "text-muted-foreground",
    );
  });

  it("passes the drag and key handlers a grip needs through", () => {
    const onDragStart = vi.fn<() => void>();
    const onKeyDown = vi.fn<() => void>();
    render(
      <RowAction
        draggable
        icon={GripVertical}
        name="Move Mortgage"
        onDragStart={onDragStart}
        onKeyDown={onKeyDown}
      />,
    );

    const grip = screen.getByRole("button", { name: "Move Mortgage" });

    expect(grip).toHaveAttribute("draggable", "true");

    fireEvent.dragStart(grip);
    fireEvent.keyDown(grip, { key: "ArrowUp" });

    expect(onDragStart).toHaveBeenCalledOnce();
    expect(onKeyDown).toHaveBeenCalledOnce();
  });
});
