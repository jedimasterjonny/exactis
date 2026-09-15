import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Projection } from "./projection";
import { getProjection } from "./store";

vi.mock("./store", () => ({ getProjection: vi.fn() }));

describe("Projection", () => {
  it("hands the store's projection to the chart", async () => {
    vi.mocked(getProjection).mockResolvedValue([
      { age: 36, deferred: 412880, free: 286145, year: 2026 },
      { age: 37, deferred: 462079, free: 321452, year: 2027 },
    ]);

    render(await Projection());

    expect(screen.getByRole("application")).toHaveClass("recharts-surface");
    expect(screen.getByText("Tax-free")).toBeInTheDocument();
  });
});
