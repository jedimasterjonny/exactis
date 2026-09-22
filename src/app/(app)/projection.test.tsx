import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getProjection } from "@/store/plan";

import { Projection } from "./projection";

vi.mock("@/store/plan", () => ({ getProjection: vi.fn() }));

describe("Projection", () => {
  it("hands the store's projection to the chart", async () => {
    vi.mocked(getProjection).mockResolvedValue([
      { age: 36, deferred: 412880, free: 286145, uncovered: 0, year: 2026 },
      { age: 37, deferred: 462079, free: 321452, uncovered: 0, year: 2027 },
    ]);

    render(await Projection());

    expect(screen.getByRole("application")).toHaveClass("recharts-surface");
    expect(screen.getByText("Tax-free")).toBeInTheDocument();
  });
});
