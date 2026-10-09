import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { soundKept } from "@/data/household";
import { kept } from "@/data/household.fixture";
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
    expect(screen.getByText("Imported 3 Sep 2026")).toBeInTheDocument();
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
