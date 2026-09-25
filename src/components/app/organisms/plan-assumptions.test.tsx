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
import { plan } from "@/data/income.fixture";

import { PlanAssumptions } from "./plan-assumptions";

vi.mock("@/actions/plan", () => ({ saveAges: vi.fn() }));

// The fixture's plan runs from 2026, when its owner born in 1990 is 36,
// to 2079, when they are 89, and they retire at 59 within it.
const retiring: Plan = { ...plan, retires: 59 };

// A save reports through the toast manager, which needs its Toaster
// mounted.
function renderAssumptions(held: Plan = retiring): void {
  render(
    <Toaster>
      <PlanAssumptions plan={held} />
    </Toaster>,
  );
}

// Types an age into the dialog's box and leaves it, which commits it.
function typeAge(age: string): void {
  const input = screen.getByRole("textbox", { name: "Plan end age" });
  fireEvent.change(input, { target: { value: age } });
  fireEvent.blur(input);
}

describe("PlanAssumptions", () => {
  it("opens on the age the plan runs to in a box with no slider", () => {
    renderAssumptions();

    fireEvent.click(screen.getByRole("button", { name: "Assumptions" }));

    const dialog = screen.getByRole("dialog", { name: "Projected to age 89" });

    expect(within(dialog).getByText("Assumptions")).toHaveClass("text-brand");
    expect(
      within(dialog).getByRole("textbox", { name: "Plan end age" }),
    ).toHaveValue("89");
    expect(within(dialog).getByRole("paragraph")).toHaveTextContent(
      "Runs to 2079",
    );
    expect(
      within(dialog).queryByRole("slider", { hidden: true }),
    ).not.toBeInTheDocument();
  });

  it("holds a typed age between the age its owner retires at and 120", () => {
    renderAssumptions();

    fireEvent.click(screen.getByRole("button", { name: "Assumptions" }));
    typeAge("50");

    expect(
      screen.getByRole("dialog", { name: "Projected to age 59" }),
    ).toBeInTheDocument();

    typeAge("130");

    expect(
      screen.getByRole("dialog", { name: "Projected to age 120" }),
    ).toBeInTheDocument();
  });

  // Retiring at 30, which 36 is past, the plan may end no sooner than
  // 37, the first age it has a year to project.
  it("holds the age past the one already reached when retirement is past too", () => {
    renderAssumptions({ ...plan, retires: 30 });

    fireEvent.click(screen.getByRole("button", { name: "Assumptions" }));
    typeAge("20");

    expect(
      screen.getByRole("dialog", { name: "Projected to age 37" }),
    ).toBeInTheDocument();
  });

  it("follows the age typed in the dialog and saves it, then closes and reports it", async () => {
    vi.mocked(saveAges).mockResolvedValue({ ends: 95, retires: 59 });
    renderAssumptions();

    fireEvent.click(screen.getByRole("button", { name: "Assumptions" }));
    const dialog = screen.getByRole("dialog", { name: "Projected to age 89" });
    typeAge("95");

    expect(dialog).toHaveAccessibleName("Projected to age 95");
    expect(within(dialog).getByRole("paragraph")).toHaveTextContent(
      "Runs to 2085",
    );
    expect(saveAges).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(saveAges).toHaveBeenCalledExactlyOnceWith({ ends: 95 });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: /^Projected to age/ }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole("dialog", { name: "Assumptions updated" }),
    ).toHaveAccessibleDescription("Projected to age 95");
  });

  it("stays open and says why when the store refuses the age", async () => {
    vi.mocked(saveAges).mockRejectedValue(
      new Error("A plan's owner retires no later than it ends"),
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
      screen.getByRole("dialog", { name: "Projected to age 89" }),
    ).toBeInTheDocument();
  });

  it("closes on Cancel and saves nothing", () => {
    renderAssumptions();

    fireEvent.click(screen.getByRole("button", { name: "Assumptions" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("dialog", { name: "Projected to age 89" }),
    ).not.toBeInTheDocument();
    expect(saveAges).not.toHaveBeenCalled();
  });
});
