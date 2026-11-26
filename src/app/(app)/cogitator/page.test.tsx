import type { JSX } from "react";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Household } from "@/data/household";
import type { PortfolioFeed, PortfolioHandoff } from "@/data/portfolio";
import type { Target, Targets } from "@/data/targets";

import { syncTargetsFromPortfolio } from "@/actions/targets";
import { soundKept } from "@/data/household";
import { kept, today } from "@/data/household.fixture";
import { targets, targetsUnder } from "@/data/targets.fixture";
import { refused, saved } from "@/lib/answer";
import { getHousehold, getOpened } from "@/store/household";
import { getPortfolioFeed } from "@/store/portfolio";
import { field } from "@/test/dom";

import Cogitator, { metadata } from "./page";

vi.mock("@/actions/targets", () => ({ syncTargetsFromPortfolio: vi.fn() }));
vi.mock("@/store/household", () => ({
  getHousehold: vi.fn(),
  getOpened: vi.fn(),
}));
vi.mock("@/store/portfolio", () => ({ getPortfolioFeed: vi.fn() }));

type OwnedFeed = NonNullable<Awaited<ReturnType<typeof getPortfolioFeed>>>;

const syncedTargets: Targets = { ...targets, portfolios: [] };

const household: Household = {
  ...soundKept(kept).household,
  split: { stocks: 0.8 },
  targets: syncedTargets,
};

// The page at an address holding what is given.
async function cogitator(
  address: Record<string, string> = {},
): Promise<JSX.Element> {
  return Cogitator({ searchParams: Promise.resolve(address) });
}

// A stored owned portfolio feed matching syncedTargets by default, with
// quote freshness dated to the fixture's import day.
function feedOf({
  categories = syncedTargets.categories,
  handoff = { securitiesAccounts: [], securitiesByCategory: {} },
  latestQuoteDate = "2026-09-07",
  savedOn = "2026-09-07",
  targets: answer,
}: {
  readonly categories?: readonly Target[];
  readonly handoff?: PortfolioHandoff;
  readonly latestQuoteDate?: null | string;
  readonly savedOn?: string;
  readonly targets?: PortfolioFeed["targets"];
} = {}): OwnedFeed {
  return {
    feed: {
      handoff,
      latestQuoteDate,
      latestTransactionDate: "2026-09-07",
      targets: answer ?? saved({ categories, portfolios: [] }),
    },
    fileName: "northstar.portfolio",
    savedOn,
    version: 1,
  };
}

// Builds a handoff mapping the first category to a single held security
// in Brokerage so trade handoff links resolve cleanly.
function handoffFor(categories: readonly Target[]): PortfolioHandoff {
  const [first] = categories;
  return {
    securitiesAccounts: [{ id: "acc-brokerage", name: "Brokerage" }],
    securitiesByCategory:
      first === undefined
        ? {}
        : {
            [first.id]: [{ heldInAccountIds: ["acc-brokerage"], id: "sec-1" }],
          },
  };
}

// Reference categories with the first category's held value bumped so
// bookkeeping differs from saved targets.
function withBumpedValue(categories: readonly Target[]): readonly Target[] {
  return categories.map((category, index) =>
    index === 0 ? { ...category, value: category.value + 500 } : category,
  );
}

// Reference categories with 5pp shifted between the first two shares
// while every bookkeeping field stays identical.
function withShiftedShares(categories: readonly Target[]): readonly Target[] {
  const [first, second, ...rest] = categories;
  if (first === undefined || second === undefined) {
    return categories;
  }
  return [
    { ...first, share: first.share + 0.05 },
    { ...second, share: second.share - 0.05 },
    ...rest,
  ];
}

// Reference categories with an unmapped category carved out of the
// first category's share, triggering holdWhileLive under CMA rates.
function withUnmappedCategory(
  categories: readonly Target[],
): readonly Target[] {
  const [first, ...rest] = categories;
  if (first === undefined) {
    return categories;
  }
  return [
    { ...first, share: first.share - 0.05 },
    ...rest,
    {
      classes: ["Equity"],
      id: "unmapped-frontier",
      isImplemented: true,
      name: "Frontier markets",
      share: 0.05,
      value: 1000,
    },
  ];
}

describe("Cogitator", () => {
  beforeEach(() => {
    vi.mocked(getHousehold).mockResolvedValue(household);
    vi.mocked(getOpened).mockResolvedValue(null);
    vi.mocked(getPortfolioFeed).mockResolvedValue(feedOf());
  });

  it("titles the page by its label in the navigation", () => {
    expect(metadata).toStrictEqual({ title: "Cogitator" });
  });

  // Read on the fixture's day, eight days after its latest quote date,
  // with an offered amount so trade handoff links render on the tiles.
  it("lays the board out over a synced owned portfolio with quote freshness, Open Portfolio, and trade handoff links", async () => {
    vi.setSystemTime(today);
    vi.mocked(getPortfolioFeed).mockResolvedValue(
      feedOf({ handoff: handoffFor(syncedTargets.categories) }),
    );

    render(await cogitator({ amount: "1250", from: "2026-08" }));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Next best trades",
    );
    expect(
      screen.getByText("Quotes to 7 Sep 2026 · 8 days old"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open Portfolio" }),
    ).toHaveAttribute("href", "/portfolio");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /^Record purchase of /u }).length,
    ).toBeGreaterThan(0);
  });

  it("falls back to Synced freshness and Upload on Portfolio without trade handoff links when no portfolio file is stored", async () => {
    vi.setSystemTime(today);
    vi.mocked(getPortfolioFeed).mockResolvedValue(null);

    render(await cogitator({ amount: "1250", from: "2026-08" }));

    expect(
      screen.getByText("Synced 7 Sep 2026 · 8 days old"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Upload on Portfolio" }),
    ).toHaveAttribute("href", "/portfolio");
    expect(
      screen.queryByRole("link", { name: /^Record /u }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("shows a refusal caution when the owned portfolio file's targets cannot be read", async () => {
    vi.mocked(getPortfolioFeed).mockResolvedValue(
      feedOf({ targets: refused("The file has no Asset Allocation taxonomy") }),
    );

    render(await cogitator());

    expect(screen.getByRole("note")).toHaveTextContent(
      "Portfolio file could not be syncedThe file has no Asset Allocation taxonomy",
    );
  });

  it("treats share-only retargeted targets in a scenario as retargeted with no unsynced caution or trade handoff links", async () => {
    vi.mocked(getOpened).mockResolvedValue({
      isKept: true,
      name: "Retire early",
    });
    vi.mocked(getPortfolioFeed).mockResolvedValue(
      feedOf({ categories: withShiftedShares(syncedTargets.categories) }),
    );

    render(await cogitator({ amount: "1250", from: "2026-08" }));

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sync from Portfolio" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^Record /u }),
    ).not.toBeInTheDocument();
  });

  it("shows an enabled Sync from Portfolio caution when the household portfolio file has unsynced changes, and passes null branch on sync", async () => {
    vi.mocked(syncTargetsFromPortfolio).mockResolvedValue(saved(syncedTargets));
    vi.mocked(getPortfolioFeed).mockResolvedValue(
      feedOf({ categories: withBumpedValue(syncedTargets.categories) }),
    );

    const { unmount } = render(await cogitator());
    const button = screen.getByRole("button", { name: "Sync from Portfolio" });

    expect(screen.getByRole("note")).toHaveTextContent(
      "Portfolio file has newer targets or holdingsSync from Portfolio to plan trades from the latest file.",
    );
    expect(button).toBeEnabled();

    fireEvent.click(button);

    await waitFor(() => {
      expect(syncTargetsFromPortfolio).toHaveBeenCalledExactlyOnceWith(null);
    });

    // A cookie naming a deleted scenario (isKept: false) reads the household
    // and passes null as the branch rather than the dropped scenario name.
    unmount();
    vi.mocked(syncTargetsFromPortfolio).mockClear();
    vi.mocked(getOpened).mockResolvedValue({ isKept: false, name: "Dropped" });

    render(await cogitator());

    fireEvent.click(
      screen.getByRole("button", { name: "Sync from Portfolio" }),
    );

    await waitFor(() => {
      expect(syncTargetsFromPortfolio).toHaveBeenCalledExactlyOnceWith(null);
    });
  });

  it("disables Sync from Portfolio with the live-CMA blocker when an unsynced allocation adds an unmapped category", async () => {
    vi.mocked(getHousehold).mockResolvedValue({ ...household, rateSet: "cma" });
    vi.mocked(getPortfolioFeed).mockResolvedValue(
      feedOf({ categories: withUnmappedCategory(syncedTargets.categories) }),
    );

    render(await cogitator());

    const button = screen.getByRole("button", { name: "Sync from Portfolio" });

    expect(screen.getByRole("note")).toHaveTextContent(
      "Portfolio file has unsynced changes",
    );
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      /this allocation cannot be synced while the plan runs on the CMA's rates/u,
    );
  });

  it("offers inline Sync from Portfolio when a readable file is stored but no targets are synced yet", async () => {
    vi.mocked(getHousehold).mockResolvedValue({ ...household, targets: null });

    render(await cogitator());

    expect(screen.getByText("No allocation synced yet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sync from Portfolio" }),
    ).toBeEnabled();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("suppresses the unsynced caution and trade handoff links when a scenario has bookkeeping drift, and offers inline sync when it holds no targets", async () => {
    vi.mocked(getOpened).mockResolvedValue({
      isKept: true,
      name: "Retire early",
    });
    vi.mocked(getPortfolioFeed).mockResolvedValue(
      feedOf({ categories: withBumpedValue(syncedTargets.categories) }),
    );

    const { unmount } = render(
      await cogitator({ amount: "1250", from: "2026-08" }),
    );

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sync from Portfolio" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^Record /u }),
    ).not.toBeInTheDocument();

    unmount();
    vi.mocked(syncTargetsFromPortfolio).mockClear();
    vi.mocked(syncTargetsFromPortfolio).mockResolvedValue(saved(syncedTargets));
    vi.mocked(getHousehold).mockResolvedValue({ ...household, targets: null });
    render(await cogitator());

    const inlineButton = screen.getByRole("button", {
      name: "Sync from Portfolio",
    });

    expect(screen.getByText("No allocation synced yet")).toBeInTheDocument();
    expect(inlineButton).toBeEnabled();

    fireEvent.click(inlineButton);

    await waitFor(() => {
      expect(syncTargetsFromPortfolio).toHaveBeenCalledExactlyOnceWith(
        "Retire early",
      );
    });
  });

  // All in equities while the plan holds a quarter in bonds now, and
  // then while it holds none either.
  it("tells the board what the plan holds in bonds now beside the target allocation's while the two differ", async () => {
    const equityTargets: Targets = {
      ...targetsUnder("Equity"),
      portfolios: [],
    };
    const equities: Household = { ...household, targets: equityTargets };
    vi.mocked(getPortfolioFeed).mockResolvedValue(
      feedOf({ categories: equityTargets.categories }),
    );
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
    const equityTargets: Targets = {
      ...targetsUnder("Equity"),
      portfolios: [],
    };
    vi.mocked(getPortfolioFeed).mockResolvedValue(
      feedOf({ categories: equityTargets.categories }),
    );
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      cma: null,
      split: { stocks: 0.75 },
      targets: equityTargets,
    });

    render(await cogitator());

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  // The month end's link for an invented £1,250 paid in over August.
  // Then the bare address, as the navigation's link to the screen goes,
  // which opens at nothing here: the reference household runs short in
  // September, its plan's first month, and pays its ISA nothing.
  it("opens the amount at what the month end offers, saying which close it came from, and at nothing again without it", async () => {
    const { rerender } = render(
      await cogitator({ amount: "1250", from: "2026-08" }),
    );

    expect(field("Amount to invest")).toHaveValue("£1,250");
    expect(field("Amount to invest")).toHaveAccessibleDescription(
      "£1,250 from August's close",
    );

    rerender(await cogitator());

    expect(field("Amount to invest")).toHaveValue("£0");
    expect(field("Amount to invest")).not.toHaveAccessibleDescription();
  });

  // The reference household with its expenses dropped: its ISA takes
  // its £20,000 a year fixed, £1,667 in September, the plan's first
  // month. Then the month end's link, whose offer comes first.
  it("opens the amount at what the plan pays into the ISAs and GIA in its first month, saying so, where the address offers none", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      schedule: { ...household.schedule, expenses: [] },
    });

    const { rerender } = render(await cogitator());

    expect(field("Amount to invest")).toHaveValue("£1,667");
    expect(field("Amount to invest")).toHaveAccessibleDescription(
      "£1,667 planned for the ISAs and GIA in September",
    );

    rerender(await cogitator({ amount: "1250", from: "2026-08" }));

    expect(field("Amount to invest")).toHaveValue("£1,250");
    expect(field("Amount to invest")).toHaveAccessibleDescription(
      "£1,250 from August's close",
    );
  });

  // The month end's link for the cash the fixture's brokerage account
  // holds uninvested.
  it("opens the account choice on the account the month end offers the amount in", async () => {
    render(
      await cogitator({ account: "Brokerage", amount: "64", from: "2026-09" }),
    );

    expect(screen.getByRole("combobox", { name: "Account" })).toHaveValue(
      "Brokerage",
    );
    expect(field("Amount to invest")).toHaveValue("£64");
  });

  it.each([
    { amount: "0", from: "2026-08" },
    { amount: "12.5", from: "2026-08" },
    { amount: "1250", from: "2026-13" },
    { amount: "1250" },
  ])(
    "opens the amount at nothing where the address offers no amount, as %o",
    async (address) => {
      render(await cogitator(address));

      expect(field("Amount to invest")).toHaveValue("£0");
      expect(field("Amount to invest")).not.toHaveAccessibleDescription();
    },
  );

  it("says no portfolio file is uploaded when neither file nor targets are stored", async () => {
    vi.mocked(getHousehold).mockResolvedValue({ ...household, targets: null });
    vi.mocked(getPortfolioFeed).mockResolvedValue(null);

    render(await cogitator());

    expect(
      screen.getByText("No portfolio file uploaded yet"),
    ).toBeInTheDocument();
  });
});
