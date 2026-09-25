import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { plan } from "@/data/income.fixture";
import { getPlan, getProjection } from "@/store/plan";

import { Projection } from "./projection";

vi.mock("@/store/plan", () => ({ getPlan: vi.fn(), getProjection: vi.fn() }));

describe("Projection", () => {
  // Born in 1990 and retiring at 36, the plan's owner retires in its
  // first year, which the chart marks.
  it("hands the store's projection to the chart, marked where the plan's owner retires", async () => {
    vi.mocked(getPlan).mockResolvedValue({ ...plan, retires: 36 });
    vi.mocked(getProjection).mockResolvedValue([
      {
        age: 36,
        deferred: 412880,
        early: 0,
        free: 286145,
        uncovered: 0,
        year: 2026,
      },
      {
        age: 37,
        deferred: 462079,
        early: 0,
        free: 321452,
        uncovered: 0,
        year: 2027,
      },
    ]);

    render(await Projection());

    expect(screen.getByRole("application")).toHaveClass("recharts-surface");
    expect(screen.getByText("Tax-free")).toBeInTheDocument();
    expect(screen.getByText("Retirement")).toBeInTheDocument();
  });
});
