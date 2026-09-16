import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Toaster } from "@/components/kit/toast";
import { points } from "@/data/points";

import { ProgressPoints } from "./progress-points";

function commit(field: HTMLElement, value: string): void {
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

function openEditor(date: string): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: `Edit ${date}` }));
  return screen.getByRole("dialog", { name: date });
}

// Save reports through the toast manager, which needs its Toaster mounted.
function renderPoints(): void {
  render(
    <Toaster>
      <ProgressPoints points={points} />
    </Toaster>,
  );
}

describe("ProgressPoints", () => {
  it("lists every point as a row of right-aligned figures with an edit button", () => {
    renderPoints();

    const table = screen.getByRole("table");
    const [, ...rows] = within(table).getAllByRole("row");

    expect(rows).toHaveLength(points.length);
    expect(within(table).getAllByRole("columnheader")).toHaveLength(6);
    expect(
      within(table).getByRole("cell", { name: "31 Aug 2026" }),
    ).not.toHaveClass("figure");
    expect(within(table).getByRole("cell", { name: "£412,880" })).toHaveClass(
      "figure",
      "text-right",
    );
    expect(
      within(table).getAllByRole("button", { name: /^Edit / }),
    ).toHaveLength(points.length);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the point in a dialog of its four balances", () => {
    renderPoints();

    const dialog = openEditor("31 Aug 2026");

    expect(within(dialog).getByText("Edit point")).toHaveClass("text-brand");
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(4);
    expect(
      within(dialog).getByRole("textbox", { name: "Asset loans" }),
    ).toHaveValue("£182,940");
  });

  it("writes a saved edit back into the table and reports it", () => {
    renderPoints();

    const dialog = openEditor("31 Aug 2026");

    commit(
      within(dialog).getByRole("textbox", { name: "Tax-deferred" }),
      "415,000",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(
      screen.queryByRole("dialog", { name: "31 Aug 2026" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Point updated" }),
    ).toHaveAccessibleDescription("31 Aug 2026");

    const table = screen.getByRole("table");

    expect(
      within(table).getByRole("cell", { name: "£415,000" }),
    ).toBeInTheDocument();
    expect(
      within(table).queryByRole("cell", { name: "£412,880" }),
    ).not.toBeInTheDocument();
  });

  it("drops a cancelled edit and a cleared field", () => {
    renderPoints();

    let dialog = openEditor("31 Jul 2026");

    commit(
      within(dialog).getByRole("textbox", { name: "Tax-free" }),
      "300,000",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    dialog = openEditor("31 Jul 2026");

    commit(within(dialog).getByRole("textbox", { name: "Tax-free" }), "");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    const table = screen.getByRole("table");

    expect(
      within(table).getByRole("cell", { name: "£281,003" }),
    ).toBeInTheDocument();
    expect(
      within(table).queryByRole("cell", { name: "£300,000" }),
    ).not.toBeInTheDocument();
  });
});
