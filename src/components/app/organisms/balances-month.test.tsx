import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { saveBalancesMonth } from "@/actions/accounts";
import { Toaster } from "@/components/kit/toast";
import { refused, saved } from "@/lib/answer";

import { BalancesMonth } from "./balances-month";

vi.mock("@/actions/accounts", () => ({ saveBalancesMonth: vi.fn() }));

// Picks March in the dialog's month and types 2025 into its year,
// leaving the box, which commits it.
function pickMarch2025(): void {
  fireEvent.change(screen.getByRole("combobox", { name: "Month" }), {
    target: { value: "2" },
  });
  const year = screen.getByRole("textbox", { name: "Year" });
  fireEvent.change(year, { target: { value: "2025" } });
  fireEvent.blur(year);
}

// A save reports through the toast manager, which needs its Toaster
// mounted. The balances are as of September 2026.
function renderMonth(): void {
  render(
    <Toaster>
      <BalancesMonth at={{ month: 8, year: 2026 }} />
    </Toaster>,
  );
}

describe("BalancesMonth", () => {
  it("opens on the month the balances are as of, saying no balance moves with it", () => {
    renderMonth();

    fireEvent.click(screen.getByRole("button", { name: "Balances month" }));

    const dialog = screen.getByRole("dialog", {
      name: "Balances as of September 2026",
    });

    expect(within(dialog).getByText("Balances month")).toHaveClass(
      "text-brand",
    );
    expect(within(dialog).getByRole("combobox", { name: "Month" })).toHaveValue(
      "8",
    );
    expect(within(dialog).getByRole("textbox", { name: "Year" })).toHaveValue(
      "2026",
    );
    expect(within(dialog).getByRole("paragraph")).toHaveTextContent(
      "Every balance is taken as this month's, and none moves with it: save each account's balance for the month.",
    );
  });

  it("saves the month picked, closes and reports it", async () => {
    vi.mocked(saveBalancesMonth).mockResolvedValue(
      saved({ month: 2, year: 2025 }),
    );
    renderMonth();

    fireEvent.click(screen.getByRole("button", { name: "Balances month" }));
    pickMarch2025();

    expect(
      screen.getByRole("dialog", { name: "Balances as of March 2025" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Balances month updated" }),
      ).toHaveAccessibleDescription("Balances as of March 2025");
    });
    expect(saveBalancesMonth).toHaveBeenCalledExactlyOnceWith({
      month: 2,
      year: 2025,
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Balances as of March 2025" }),
      ).not.toBeInTheDocument();
    });
  });

  it("keeps the dialog open when the store refuses, and says why", async () => {
    vi.mocked(saveBalancesMonth).mockResolvedValue(
      refused("The balances are as of a month that has begun"),
    );
    renderMonth();

    fireEvent.click(screen.getByRole("button", { name: "Balances month" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Balances month not saved" }),
      ).toHaveAccessibleDescription(
        "The balances are as of a month that has begun",
      );
    });
    expect(
      screen.getByRole("dialog", { name: "Balances as of September 2026" }),
    ).toBeInTheDocument();
  });

  it("drops the draft on dismiss, so it opens on the balances' month again", () => {
    renderMonth();

    fireEvent.click(screen.getByRole("button", { name: "Balances month" }));
    pickMarch2025();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Balances month" }));

    expect(
      screen.getByRole("dialog", { name: "Balances as of September 2026" }),
    ).toBeInTheDocument();
  });
});
