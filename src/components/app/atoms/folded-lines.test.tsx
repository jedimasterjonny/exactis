import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FoldedLines } from "./folded-lines";

// The lines in the box a caller folds a row into, which here is a list
// item, positioned as a caller positions it for the button to cover.
function renderInItem(lines: React.JSX.Element): void {
  render(
    <ul>
      <li className="relative">{lines}</li>
    </ul>,
  );
}

describe("FoldedLines", () => {
  it("draws the name and the figure across the first line, and the rest beneath, faint", () => {
    renderInItem(
      <FoldedLines figure="£103,972" name="Stocks & shares ISA">
        <span>Tax-free · Me</span>
        <span>Spare, to £20,000 / yr</span>
      </FoldedLines>,
    );

    const item = screen.getByRole("listitem");

    expect(within(item).getByText("Stocks & shares ISA")).toHaveClass(
      "font-medium",
    );
    expect(within(item).getByText("£103,972")).toHaveClass(
      "figure",
      "whitespace-nowrap",
    );
    // eslint-disable-next-line testing-library/no-node-access -- the lines beneath are a layout box with no role or text of their own to query by
    expect(within(item).getByText("Tax-free · Me").parentElement).toHaveClass(
      "text-xs",
      "text-muted-foreground",
    );
    expect(within(item).getByText("Spare, to £20,000 / yr")).toBeVisible();
    expect(within(item).queryByRole("button")).not.toBeInTheDocument();
  });

  // The button covers the box the caller positions, which is the whole
  // of a folded row, so a tap anywhere on it opens the row; the chevron
  // says it will.
  it("makes the name a button covering the row when given something to open", () => {
    const onOpen = vi.fn<() => void>();
    renderInItem(
      <FoldedLines figure="£103,972" name="Stocks & shares ISA" onOpen={onOpen}>
        <span>Tax-free · Me</span>
      </FoldedLines>,
    );

    const item = screen.getByRole("listitem");

    const open = within(item).getByRole("button", {
      name: "Stocks & shares ISA",
    });
    // eslint-disable-next-line testing-library/no-node-access -- the chevron is hidden from the accessibility tree, so has no role to query by
    const chevron = open.parentElement?.querySelector("svg");

    expect(open).toHaveClass("after:absolute", "after:inset-0");
    expect(chevron).toHaveAttribute("aria-hidden", "true");
    expect(chevron).not.toHaveClass("invisible");

    fireEvent.click(open);

    expect(onOpen).toHaveBeenCalledOnce();
  });

  // A total opens nothing, and keeps the chevron's place so its figure
  // lines up with those of the rows above it.
  it("keeps the chevron's place unseen with nothing to open, and draws nothing beneath with nothing to say", () => {
    renderInItem(<FoldedLines figure="£366,293" name="Total" />);

    const item = screen.getByRole("listitem");

    // eslint-disable-next-line testing-library/no-node-access -- the chevron is hidden from the accessibility tree, so has no role to query by
    expect(item.querySelector("svg")).toHaveClass("invisible");
    // eslint-disable-next-line testing-library/no-node-access -- the lines beneath are a layout box with no role of their own
    expect(item.children).toHaveLength(1);
  });

  // A row edited elsewhere does not open, and says why in the lock its
  // caller gives, drawn where the chevron would be.
  it("draws the lock it is given in the chevron's place", () => {
    renderInItem(
      <FoldedLines
        figure="£2,244 / mo"
        lock={
          <span
            aria-label="Edited with its asset on the accounts screen"
            role="img"
          />
        }
        name="Home mortgage"
      />,
    );

    const item = screen.getByRole("listitem");

    expect(
      within(item).getByRole("img", {
        name: "Edited with its asset on the accounts screen",
      }),
    ).toBeInTheDocument();
    expect(within(item).queryByRole("button")).not.toBeInTheDocument();
    // eslint-disable-next-line testing-library/no-node-access -- the chevron is hidden from the accessibility tree, so its absence is read off the nodes
    expect(item.querySelector("svg")).not.toBeInTheDocument();
  });
});
