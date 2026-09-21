import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Projection } from "./projection";
import { getProjection } from "./store";

vi.mock("./store", () => ({ getProjection: vi.fn() }));

describe("Projection", () => {
  it("hands the store's projection to the chart", async () => {
    vi.mocked(getProjection).mockResolvedValue([
      { age: 34, deferred: 391640, free: 271930, uncovered: 0, year: 2026 },
      { age: 35, deferred: 438308, free: 305483, uncovered: 0, year: 2027 },
    ]);

    render(await Projection());

    expect(screen.getByRole("application")).toHaveClass("recharts-surface");
    expect(screen.getByText("Tax-free")).toBeInTheDocument();
  });
});
