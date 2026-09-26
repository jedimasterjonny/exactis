import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";

import { accounts } from "@/data/accounts.fixture";

import { PaymentOrder } from "./payment-order";

type Move = (account: Account, target: Account) => void;

// The fixture's savings, in the order the store lists them: the ones
// the order is set over, since an asset is paid nothing out of the
// month and drawn on never, and a debt is paid before any of them.
const [pension, isa, cash] = accounts;
const held: readonly Account[] = [pension, isa, cash];

describe("PaymentOrder", () => {
  it("numbers the accounts down the line, and says what the order decides", () => {
    render(
      <PaymentOrder
        accounts={held}
        label="Sect. II.iii"
        onMove={vi.fn<Move>()}
      />,
    );

    const region = screen.getByRole("region", { name: "Order of payment" });

    expect(within(region).getByText("Sect. II.iii")).toHaveClass("label");
    expect(
      within(region).getByText(
        "Debts are always paid first. Savings are then paid in this order, and drawn on in it one kind at a time.",
      ),
    ).toHaveClass("text-muted-foreground");
    expect(
      within(region)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toStrictEqual([
      "1Workplace pension",
      "2Stocks & shares ISA",
      "3Current account",
    ]);
    expect(
      within(region).getByRole("button", { name: "Reorder" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("draws nothing for an order of fewer than two", () => {
    const onMove = vi.fn<Move>();
    const { container, rerender } = render(
      <PaymentOrder
        accounts={[pension]}
        label="Sect. II.iii"
        onMove={onMove}
      />,
    );

    expect(container).toBeEmptyDOMElement();

    rerender(
      <PaymentOrder accounts={[]} label="Sect. II.iii" onMove={onMove} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  // Each move is reported as it lands, from the keyboard or by a drop,
  // and the rows stay as given, since the caller re-renders them in the
  // order it keeps; a drag over the row on the move marks nothing.
  it("reorders in a dialog, reporting each move as it lands, and closes on Done", async () => {
    const onMove = vi.fn<Move>();
    render(
      <PaymentOrder accounts={held} label="Sect. II.iii" onMove={onMove} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reorder" }));

    const dialog = screen.getByRole("dialog", { name: "Order of payment" });
    const cashRow = within(dialog).getByRole("row", {
      name: /Current account/,
    });
    const pensionRow = within(dialog).getByRole("row", {
      name: /Workplace pension/,
    });

    expect(within(dialog).getByText("Reorder")).toHaveClass(
      "label",
      "text-brand",
    );
    expect(within(dialog).getAllByRole("row")).toHaveLength(held.length);
    expect(cashRow).toHaveTextContent("3Current accountCash");

    fireEvent.keyDown(
      within(dialog).getByRole("button", { name: "Move Stocks & shares ISA" }),
      { key: "ArrowUp" },
    );

    expect(onMove).toHaveBeenLastCalledWith(isa, pension);

    fireEvent.dragStart(
      within(dialog).getByRole("button", { name: "Move Current account" }),
      { dataTransfer: { setData: vi.fn() } },
    );
    fireEvent.dragOver(cashRow);

    expect(cashRow).toHaveAttribute("data-moving", "");
    expect(cashRow).not.toHaveAttribute("data-over");

    fireEvent.dragOver(pensionRow);

    expect(pensionRow).toHaveAttribute("data-over", "");

    fireEvent.drop(pensionRow);

    expect(onMove).toHaveBeenLastCalledWith(cash, pension);
    expect(onMove).toHaveBeenCalledTimes(2);

    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
