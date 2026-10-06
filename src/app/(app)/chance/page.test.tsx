import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { accounts } from "@/data/accounts.fixture";
import { soundKept } from "@/data/household";
import { blank } from "@/data/household.fixture";
import { getHousehold } from "@/store/household";
import { FuturesWorker } from "@/test/futures-worker";

import Chance from "./page";

vi.mock("@/store/household", () => ({ getHousehold: vi.fn() }));

// The household before anything is saved, as the store reads it, for
// each test to lay what the page reads over.
const { household } = soundKept(blank);

describe("Chance", () => {
  // jsdom has no Worker, and the chance of success draws its futures on two.
  beforeEach(() => {
    vi.stubGlobal("Worker", FuturesWorker);
  });

  it("hands the store's spread to the board, which says why there is nothing to draw", async () => {
    vi.mocked(getHousehold).mockResolvedValue(household);

    render(await Chance());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Chance of success",
    );
    expect(screen.getByText("Sect. II · Chance of success")).toHaveClass(
      "label",
    );
    expect(
      screen.getAllByText("No spread to draw the futures from"),
    ).not.toHaveLength(0);
    expect(
      screen.getByText(/^No CMA is pulled, so there is nothing to draw/),
    ).toBeInTheDocument();
  });

  it("hands the store's accounts, lines and plan to the board, which starts drawing the futures", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      accounts: [...accounts],
      spread: { inflation: 0.02, rate: 0.14 },
    });

    render(await Chance());

    expect(screen.getByText("Drawing 0 of 1,000 futures…")).toHaveClass(
      "text-muted-foreground",
    );
  });
});
