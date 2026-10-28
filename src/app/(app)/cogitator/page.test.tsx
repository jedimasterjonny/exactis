import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { soundKept } from "@/data/household";
import { kept } from "@/data/household.fixture";
import { targetsUnder } from "@/data/targets.fixture";
import { getHousehold } from "@/store/household";

import Cogitator from "./page";

vi.mock("@/store/household", () => ({ getHousehold: vi.fn() }));

describe("Cogitator", () => {
  it("lays the board out over the target allocation the store holds", async () => {
    vi.mocked(getHousehold).mockResolvedValue(soundKept(kept).household);

    render(await Cogitator());

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

    const { unmount } = render(await Cogitator());

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
    render(await Cogitator());

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("says nothing of bonds with no CMA to say which categories hold them", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...soundKept(kept).household,
      cma: null,
      split: { stocks: 0.75 },
      targets: targetsUnder("Equity"),
    });

    render(await Cogitator());

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("says no allocation is imported while the store holds none", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...soundKept(kept).household,
      targets: null,
    });

    render(await Cogitator());

    expect(screen.getByText("No allocation imported yet")).toBeInTheDocument();
  });
});
