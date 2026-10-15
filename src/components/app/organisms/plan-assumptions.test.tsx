import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Plan } from "@/data/plan";

import { saveAges } from "@/actions/plan";
import { Toaster } from "@/components/kit/toast";
import { plan, retiring } from "@/data/income.fixture";
import { working } from "@/data/owners.fixture";
import { refused, saved } from "@/lib/answer";
import { commit } from "@/test/dom";

import { PlanAssumptions } from "./plan-assumptions";

vi.mock("@/actions/plan", () => ({ saveAges: vi.fn() }));

// The assumptions on the plan given or the fixture's retiring one,
// which runs from 2026, when its owner born in 1992 is 34, to 2083,
// when they are 91, and retires them at 61 within it. A save reports
// through the toast manager, which needs its Toaster mounted.
function renderAssumptions(held: Plan = retiring): void {
  render(<PlanAssumptions plan={held} />, { wrapper: Toaster });
}

// Types an age into the dialog's box and leaves it, which commits it.
function typeAge(age: string): void {
  const input = screen.getByRole("textbox", { name: "Plan end age" });
  commit(input, age);
}

describe("PlanAssumptions", () => {
  it("opens on the age the plan runs to in a box with no slider", () => {
    renderAssumptions();

    fireEvent.click(screen.getByRole("button", { name: "Assumptions" }));

    const dialog = screen.getByRole("dialog", { name: "Projected to age 91" });

    expect(within(dialog).getByText("Assumptions")).toHaveClass("text-brand");
    expect(
      within(dialog).getByRole("textbox", { name: "Plan end age" }),
    ).toHaveValue("91");
    expect(within(dialog).getByRole("paragraph")).toHaveTextContent(
      "Runs to 2083",
    );
    expect(
      within(dialog).queryByRole("slider", { hidden: true }),
    ).not.toBeInTheDocument();
  });

  it("holds a typed age between the age its owner retires at and 120", () => {
    renderAssumptions();

    fireEvent.click(screen.getByRole("button", { name: "Assumptions" }));
    typeAge("52");

    expect(
      screen.getByRole("dialog", { name: "Projected to age 61" }),
    ).toBeInTheDocument();

    typeAge("130");

    expect(
      screen.getByRole("dialog", { name: "Projected to age 120" }),
    ).toBeInTheDocument();
  });

  // Retiring at 30, which 34 is past, the plan may end no sooner than
  // 35, the first age it has a year to project.
  it("holds the age past the one already reached when retirement is past too", () => {
    renderAssumptions({ ...plan, retires: 30 });

    fireEvent.click(screen.getByRole("button", { name: "Assumptions" }));
    typeAge("20");

    expect(
      screen.getByRole("dialog", { name: "Projected to age 35" }),
    ).toBeInTheDocument();
  });

  // Retiring on twenty-five years of expenses, laid out past the plan's
  // end, the owner holds the end age to nothing but a year to project.
  it("holds the age past the one already reached alone when retirement is on conditions", () => {
    renderAssumptions({
      ...plan,
      owners: [
        {
          ...working,
          retirement: [{ measure: "liquid", of: "expenses", times: 25 }],
        },
      ],
      retires: 92,
    });

    fireEvent.click(screen.getByRole("button", { name: "Assumptions" }));
    typeAge("20");

    expect(
      screen.getByRole("dialog", { name: "Projected to age 35" }),
    ).toBeInTheDocument();
  });

  it("follows the age typed in the dialog and saves it, then closes and reports it", async () => {
    vi.mocked(saveAges).mockResolvedValue(saved({ ends: 97, retires: 61 }));
    renderAssumptions();

    fireEvent.click(screen.getByRole("button", { name: "Assumptions" }));
    const dialog = screen.getByRole("dialog", { name: "Projected to age 91" });
    typeAge("97");

    expect(dialog).toHaveAccessibleName("Projected to age 97");
    expect(within(dialog).getByRole("paragraph")).toHaveTextContent(
      "Runs to 2089",
    );
    expect(saveAges).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveAges).toHaveBeenCalledExactlyOnceWith({ ends: 97 });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /^Projected to age/ }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Assumptions updated" }),
    ).toHaveAccessibleDescription("Projected to age 97");
  });

  it("stays open and says why when the store refuses the age", async () => {
    vi.mocked(saveAges).mockResolvedValue(
      refused("A plan's owner retires no later than it ends"),
    );
    renderAssumptions();

    fireEvent.click(screen.getByRole("button", { name: "Assumptions" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Assumptions not saved" }),
      ).toHaveAccessibleDescription(
        "A plan's owner retires no later than it ends",
      );
    });
    expect(
      screen.getByRole("dialog", { name: "Projected to age 91" }),
    ).toBeInTheDocument();
  });

  it("closes on Cancel and saves nothing", () => {
    renderAssumptions();

    fireEvent.click(screen.getByRole("button", { name: "Assumptions" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("dialog", { name: "Projected to age 91" }),
    ).not.toBeInTheDocument();
    expect(saveAges).not.toHaveBeenCalled();
  });
});
