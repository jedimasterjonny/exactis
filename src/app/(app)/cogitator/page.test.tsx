import type { JSX } from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { soundKept } from "@/data/household";
import { kept } from "@/data/household.fixture";
import { targetsUnder } from "@/data/targets.fixture";
import { getHousehold } from "@/store/household";
import { field } from "@/test/dom";

import Cogitator from "./page";

vi.mock("@/store/household", () => ({ getHousehold: vi.fn() }));

// The page at an address holding what is given.
async function cogitator(
  address: Record<string, string> = {},
): Promise<JSX.Element> {
  return Cogitator({ searchParams: Promise.resolve(address) });
}

describe("Cogitator", () => {
  it("lays the board out over the target allocation the store holds", async () => {
    vi.mocked(getHousehold).mockResolvedValue(soundKept(kept).household);

    render(await cogitator());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Next best trades",
    );
    expect(screen.getByText("Imported 7 Sep 2026")).toBeInTheDocument();
  });

  // All in equities while the plan holds a quarter in bonds now, and
  // then while it holds none either.
  it("tells the board what the plan holds in bonds now beside the target allocation's while the two differ", async () => {
    const equities = {
      ...soundKept(kept).household,
      targets: targetsUnder("Equity"),
    };
    vi.mocked(getHousehold).mockResolvedValue({
      ...equities,
      split: { stocks: 0.75 },
    });

    const { unmount } = render(await cogitator());

    expect(
      screen.getByText(
        "The target allocation holds 0% in bonds; the plan holds 25% now",
      ),
    ).toBeInTheDocument();

    unmount();
    vi.mocked(getHousehold).mockResolvedValue({
      ...equities,
      split: { stocks: 1 },
    });
    render(await cogitator());

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("says nothing of bonds with no CMA to say which categories hold them", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...soundKept(kept).household,
      cma: null,
      split: { stocks: 0.75 },
      targets: targetsUnder("Equity"),
    });

    render(await cogitator());

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  // The month end's link for an invented £1,250 paid in over August.
  // Then the bare address, as the navigation's link to the screen goes.
  it("opens the amount at what the month end offers, saying which close it came from, and at nothing again without it", async () => {
    vi.mocked(getHousehold).mockResolvedValue(soundKept(kept).household);

    const { rerender } = render(
      await cogitator({ amount: "1250", from: "2026-08" }),
    );

    expect(field("Amount to invest")).toHaveValue("£1,250");
    expect(field("Amount to invest")).toHaveAccessibleDescription(
      "From August's close",
    );

    rerender(await cogitator());

    expect(field("Amount to invest")).toHaveValue("£0");
    expect(field("Amount to invest")).not.toHaveAccessibleDescription();
  });

  it.each([
    { amount: "0", from: "2026-08" },
    { amount: "12.5", from: "2026-08" },
    { amount: "1250", from: "2026-13" },
    { amount: "1250" },
  ])(
    "opens the amount at nothing where the address offers no amount, as %o",
    async (address) => {
      vi.mocked(getHousehold).mockResolvedValue(soundKept(kept).household);

      render(await cogitator(address));

      expect(field("Amount to invest")).toHaveValue("£0");
      expect(field("Amount to invest")).not.toHaveAccessibleDescription();
    },
  );

  it("says no allocation is imported while the store holds none", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...soundKept(kept).household,
      targets: null,
    });

    render(await cogitator());

    expect(screen.getByText("No allocation imported yet")).toBeInTheDocument();
  });
});
