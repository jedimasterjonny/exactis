import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Projection } from "./projection";
import { getProjection } from "./store";

vi.mock("./store", () => ({ getProjection: vi.fn() }));

describe("Projection", () => {
  it("hands the store's projection to the chart", async () => {
    vi.mocked(getProjection).mockResolvedValue([
      { age: 34, deferred: 391640, free: 271930, year: 2026 },
      { age: 35, deferred: 438308, free: 305483, year: 2027 },
    ]);

    render(await Projection());

    expect(screen.getByText("£743,791")).toHaveClass("figure");
    expect(screen.getByText("in 2027")).toBeInTheDocument();
  });
});
