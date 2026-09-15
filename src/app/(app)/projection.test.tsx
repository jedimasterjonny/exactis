import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Projection } from "./projection";
import { getProjection } from "./store";

vi.mock("./store", () => ({ getProjection: vi.fn() }));

describe("Projection", () => {
  it("hands the store's projection to the chart", async () => {
    vi.mocked(getProjection).mockResolvedValue([
      { age: 36, free: 286145, year: 2026 },
      { age: 37, free: 300452, year: 2027 },
    ]);

    render(await Projection());

    expect(screen.getByText("£300,452")).toHaveClass("figure");
    expect(screen.getByText("in 2027")).toBeInTheDocument();
  });
});
