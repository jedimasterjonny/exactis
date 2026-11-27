import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Household } from "@/data/household";
import type { PortfolioFeed } from "@/data/portfolio";
import type { Targets } from "@/data/targets";
import type { Answer } from "@/lib/answer";

import { retargetFromLifeStrategy } from "@/actions/lifestrategy";
import { syncTargetsFromPortfolio } from "@/actions/targets";
import { Toaster } from "@/components/kit/toast";
import { cma, mappings } from "@/data/cma.fixture";
import { soundKept } from "@/data/household";
import { blank } from "@/data/household.fixture";
import { retiring } from "@/data/income.fixture";
import { curve } from "@/data/inflation.fixture";
import { owners } from "@/data/owners.fixture";
import { allocation, rates } from "@/data/rates.fixture";
import { targets } from "@/data/targets.fixture";
import { refused, saved } from "@/lib/answer";
import { getHousehold, getOpened, getSourcesDaysAgo } from "@/store/household";
import { getPortfolioFeed } from "@/store/portfolio";
import { worksheet } from "@/test/dom";

import Assumptions, { metadata } from "./page";

vi.mock("@/store/household", () => ({
  getHousehold: vi.fn(),
  getOpened: vi.fn(),
  getSourcesDaysAgo: vi.fn(),
}));
vi.mock("@/store/portfolio", () => ({ getPortfolioFeed: vi.fn() }));
vi.mock("@/actions/cma", () => ({ pullCma: vi.fn() }));
vi.mock("@/actions/inflation", () => ({ pullCurve: vi.fn() }));
vi.mock("@/actions/lifestrategy", () => ({
  retargetFromLifeStrategy: vi.fn(),
}));
vi.mock("@/actions/owners", () => ({ saveQualifyingYears: vi.fn() }));
vi.mock("@/actions/targets", () => ({
  mapByName: vi.fn(),
  mapCategory: vi.fn(),
  syncTargetsFromPortfolio: vi.fn(),
}));
vi.mock("@/actions/plan", () => ({
  removeAnchor: vi.fn(),
  saveAllocation: vi.fn(),
  saveAnchor: vi.fn(),
  saveDeductions: vi.fn(),
  saveRates: vi.fn(),
  saveRateSet: vi.fn(),
}));

const syncedTargets: Targets = { ...targets, portfolios: [] };

// The fixtures' August vintage and the reference's mappings onto it,
// 0.20% of fees and a 2% yield, the rates typed by hand live, the
// fixtures' split, curve and target allocation, and a plan whose owner
// retires at 61, laid over the household before anything is saved as
// the store reads it.
const household: Household = {
  ...soundKept(blank).household,
  allocation,
  cma: { latest: cma, previous: null },
  curve,
  deductions: { dividends: 0.02, fees: 0.002 },
  mappings,
  plan: retiring,
  rates,
  rateSet: "custom",
  targets: syncedTargets,
};

// A stored portfolio feed carrying the given target answer, defaulting
// to the reference categories with empty portfolios.
function feedOf(
  targetAnswer: PortfolioFeed["targets"] = saved({
    categories: syncedTargets.categories,
    portfolios: [],
  }),
): NonNullable<Awaited<ReturnType<typeof getPortfolioFeed>>> {
  return {
    feed: {
      accounts: { cash: [], securities: [] },
      handoff: { securitiesAccounts: [], securitiesByCategory: {} },
      latestQuoteDate: "2026-09-25",
      latestTransactionDate: "2026-09-25",
      targets: targetAnswer,
    },
    fileName: "northstar.portfolio",
    savedOn: "2026-09-25",
    version: 3,
  };
}

// The page as Next renders it at /assumptions, under the query given.
async function page(
  searchParams: Record<string, string> = {},
): ReturnType<typeof Assumptions> {
  return Assumptions({ searchParams: Promise.resolve(searchParams) });
}

describe("Assumptions", () => {
  beforeEach(() => {
    vi.mocked(getHousehold).mockResolvedValue(household);
    vi.mocked(getOpened).mockResolvedValue(null);
    vi.mocked(getPortfolioFeed).mockResolvedValue(feedOf());
    vi.mocked(getSourcesDaysAgo).mockResolvedValue(null);
  });

  it("titles the page by its label in the navigation", () => {
    expect(metadata).toStrictEqual({ title: "Assumptions" });
  });

  // 7.25% a year over prices rising 2.95% a year is 1.0725 / 1.0295, 4.18%
  // a year in today's money, the worksheet's real return beneath.
  it("opens on the plan rate in today's money under the set's name, and hands the store's rates, split and curve to their cards", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      plan: { ...retiring, inflation: 0.0295, rate: 0.0725 },
    });

    render(await page());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Plan assumptions",
    );
    expect(screen.getByText("Sect. VI · Assumptions")).toHaveClass("label");
    expect(
      within(screen.getByRole("banner")).getByText("Custom rates"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toStrictEqual([
      "The plan rate is 7.25% a\u00a0year, 4.18% in today's\u00a0money at 2.95% inflation.",
      "Custom rates",
      "Inflation source",
    ]);
    expect(screen.getByRole("textbox", { name: "Stocks growth" })).toHaveValue(
      "5.95%",
    );
    expect(screen.getByRole("textbox", { name: "Stocks share" })).toHaveValue(
      "80.00%",
    );
    expect(worksheet("Custom rates, worked out").at(-1)).toStrictEqual([
      "Real return",
      "4.86%",
      "1.46%",
      "4.18%",
    ]);
    expect(
      screen.getByRole("region", { name: "Curve, by maturity" }),
    ).toBeInTheDocument();
  });

  // The page reads the day from the clock, so the ages are left unread.
  it("says above the tabs when each source was brought in, from the store's sources", async () => {
    render(await page());

    const [vintage, curveDay, synced, deductions] =
      screen.getAllByRole("definition");

    expect(vintage).toHaveTextContent(/^Aug 2026, data 30 Jun 2026 · /);
    expect(curveDay).toHaveTextContent(/^1 Sep 2026 · /);
    expect(synced).toHaveTextContent(/^Synced 7 Sep 2026 · /);
    expect(deductions).toHaveTextContent("Not dated");
  });

  it("hands the cards no curve and no CMA before either is pulled", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      cma: null,
      curve: null,
    });

    render(await page());

    expect(screen.getByText("No curve pulled yet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Target allocation" }));

    // A row a category, one for the group of them none of which is
    // blended before a CMA is pulled, and the header.
    expect(screen.getAllByRole("row")).toHaveLength(
      syncedTargets.categories.length + 1 + 1,
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("opens on the rates, and hands the store's target allocation, the latest CMA and the mappings to its card in the tab beside them", async () => {
    render(await page());

    expect(screen.getByRole("tab", { name: "Rates" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.queryByRole("region", { name: "Target allocation" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Target allocation" }));

    expect(
      screen.getByRole("region", { name: "Target allocation" }),
    ).toHaveTextContent("Read from northstar.portfolio on Portfolio.");
    expect(
      screen.getAllByRole("combobox", { name: "CMA class for UK equity" })[0],
    ).toHaveValue("UK large cap equities");
    expect(
      screen.queryByRole("region", { name: "Custom rates" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 })[0]).toHaveTextContent(
      /^The plan rate is .+ inflation\.$/,
    );
  });

  // At 34 the glide path holds fifteen points of bonds, as it does to 52,
  // rising to 40 by 60, which falls in 2052; the plan rate is the one it
  // grows at now.
  it("hands the glide path to its card in the third tab, and the split it holds now to the rates typed, read-only, and says the plan rate is the one it holds now", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      glide: [
        { age: 52, bonds: 0.15 },
        { age: 60, bonds: 0.4 },
      ],
      split: { stocks: 0.9 },
    });

    render(await page());

    expect(screen.getAllByRole("heading", { level: 2 })[0]?.textContent).toBe(
      "The plan rate is 5.00% a\u00a0year now, 5.00% in today's\u00a0money at 0.00% inflation.",
    );
    expect(screen.getByRole("textbox", { name: "Stocks share" })).toHaveValue(
      "90.00%",
    );
    expect(
      screen.getByRole("textbox", { name: "Stocks share" }),
    ).toHaveAttribute("readonly");

    fireEvent.click(screen.getByRole("tab", { name: "Glide path" }));

    expect(
      screen.getByRole("row", { name: "60 2052 40.00%" }),
    ).toBeInTheDocument();
  });

  // 1% a year over prices rising 3% a year is 1.01 / 1.03, 1.94% a year
  // less in today's money, signed as the worksheet signs it.
  it("says a real return below nothing as its signed figure", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      plan: { ...retiring, inflation: 0.03, rate: 0.01 },
    });

    render(await page());

    expect(screen.getAllByRole("heading", { level: 2 })[0]?.textContent).toBe(
      "The plan rate is 1.00% a\u00a0year, −1.94% in today's\u00a0money at 3.00% inflation.",
    );
  });

  // A link to the glide path names its tab in the address, and the
  // screen opens on it rather than on the rates, under the same sentence.
  it("opens on the tab the address names", async () => {
    render(await page({ tab: "glide-path" }));

    expect(screen.getByRole("tab", { name: "Glide path" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getAllByRole("heading", { level: 2 })[0]).toHaveTextContent(
      /^The plan rate is .+ inflation\.$/,
    );
  });

  // The owner, born in 1992, reaches 68 in 2060, and thirty years earn
  // £10,755 a year. The plan screen's lock links to the tab by its name
  // in the address.
  it("hands the owners to the State Pension in the fourth tab, which the address opens", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      owners: [{ ...owners[0], qualifyingYears: 30 }],
    });

    render(await page({ tab: "state-pension" }));

    expect(
      screen.getByRole("textbox", { name: "Qualifying years for Me" }),
    ).toHaveValue("30");
    expect(
      screen.getByRole("cell", { name: "£10,755 from 2060" }),
    ).toBeInTheDocument();
  });

  // The owner retires once the liquid net worth is anything at all, which
  // a household holding nothing reaches as the plan opens in 2026, so the
  // thirteen years through 2025/26 count on by none and earn £4,661 a
  // year, where counted to the State Pension age, as the plan read
  // leaves them, they would earn the full amount.
  it("hands the State Pension the plan laid out as its own projection retires its owner", async () => {
    vi.mocked(getHousehold).mockResolvedValue(
      soundKept({
        ...blank,
        owners: [
          {
            ...owners[0],
            qualifiedThrough: 2025,
            qualifyingYears: 13,
            retirement: [{ measure: "liquid", of: "pounds", times: 0 }],
          },
        ],
      }).household,
    );

    render(await page({ tab: "state-pension" }));

    expect(
      screen.getByRole("cell", { name: "£4,661 from 2060" }),
    ).toBeInTheDocument();
  });

  it("hands the rates typed the split typed while there is no glide path", async () => {
    render(await page());

    expect(screen.getByRole("textbox", { name: "Stocks share" })).toHaveValue(
      "80.00%",
    );
    expect(
      screen.getByRole("textbox", { name: "Stocks share" }),
    ).not.toHaveAttribute("readonly");
  });

  // A tab left is kept rather than drawn afresh, so a sync in flight is
  // still held when the tab is opened again, and a second cannot be
  // started over it.
  it("keeps a sync held while the rates are open", async () => {
    const answer = Promise.withResolvers<Answer<Targets>>();
    vi.mocked(syncTargetsFromPortfolio).mockReturnValue(answer.promise);
    vi.mocked(getPortfolioFeed).mockResolvedValue(
      feedOf(
        saved({
          categories: syncedTargets.categories.map((category, index) =>
            index === 0
              ? { ...category, value: category.value + 500 }
              : category,
          ),
          portfolios: [],
        }),
      ),
    );
    render(await page(), { wrapper: Toaster });

    fireEvent.click(screen.getByRole("tab", { name: "Target allocation" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Sync from Portfolio" }),
    );
    await waitFor(() => {
      expect(syncTargetsFromPortfolio).toHaveBeenCalledExactlyOnceWith(null);
    });
    fireEvent.click(screen.getByRole("tab", { name: "Rates" }));
    fireEvent.click(screen.getByRole("tab", { name: "Target allocation" }));

    const button = screen.getByRole("button", { name: "Sync from Portfolio" });

    expect(button).toHaveAttribute("aria-busy", "true");

    answer.resolve(saved(syncedTargets));

    await waitFor(() => {
      expect(button).not.toHaveAttribute("aria-busy");
    });
  });

  it("shows missing status when no portfolio file has been uploaded", async () => {
    vi.mocked(getPortfolioFeed).mockResolvedValue(null);

    render(await page({ tab: "target-allocation" }));

    expect(screen.getByRole("note")).toHaveTextContent(
      "No portfolio file uploaded yet",
    );
  });

  it("shows refused status when the owned portfolio file's targets cannot be read", async () => {
    vi.mocked(getPortfolioFeed).mockResolvedValue(
      feedOf(refused("The file has no Asset Allocation taxonomy, only none")),
    );

    render(await page({ tab: "target-allocation" }));

    expect(screen.getByRole("note")).toHaveTextContent(
      "Portfolio file could not be synced",
    );
    expect(screen.getByRole("note")).toHaveTextContent(
      "The file has no Asset Allocation taxonomy, only none",
    );
  });

  it("treats share-only divergence in a scenario as intentionally retargeted with no caution", async () => {
    const [first, second, ...rest] = syncedTargets.categories;
    vi.mocked(getOpened).mockResolvedValue({
      isKept: true,
      name: "Retire early",
    });
    vi.mocked(getPortfolioFeed).mockResolvedValue(
      feedOf(
        saved({
          categories:
            first !== undefined && second !== undefined
              ? [
                  { ...first, share: first.share + 0.05 },
                  { ...second, share: second.share - 0.05 },
                  ...rest,
                ]
              : syncedTargets.categories,
          portfolios: [],
        }),
      ),
    );

    render(await page({ tab: "target-allocation" }));

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sync from Portfolio" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Target allocation" }),
    ).toHaveTextContent(
      "Read from northstar.portfolio on Portfolio. Retargeting updates this scenario only; making it the household updates the portfolio file.",
    );
  });

  it("wires Retarget from LifeStrategy with the portfolio version in the household and the scenario name in a kept scenario", async () => {
    vi.mocked(retargetFromLifeStrategy).mockResolvedValue(
      saved({
        asOf: "2026-08-31",
        isScenarioOnly: false,
        savedOn: "2026-09-25",
        split: { stocks: 0.8 },
        version: 4,
      }),
    );

    const { unmount } = render(await page({ tab: "target-allocation" }), {
      wrapper: Toaster,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Retarget from LifeStrategy" }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: (name) => name.startsWith("LifeStrategy 80% Equity"),
      }),
    );

    await waitFor(() => {
      expect(retargetFromLifeStrategy).toHaveBeenCalledExactlyOnceWith("9244", {
        afterVersion: 3,
        on: null,
      });
    });
    unmount();

    vi.mocked(retargetFromLifeStrategy).mockClear();
    vi.mocked(retargetFromLifeStrategy).mockResolvedValue(
      saved({
        asOf: "2026-08-31",
        isScenarioOnly: true,
        split: { stocks: 0.8 },
      }),
    );
    vi.mocked(getOpened).mockResolvedValue({
      isKept: true,
      name: "Retire early",
    });

    const { unmount: unmountScenario } = render(
      await page({ tab: "target-allocation" }),
      { wrapper: Toaster },
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Retarget from LifeStrategy" }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: (name) => name.startsWith("LifeStrategy 80% Equity"),
      }),
    );

    await waitFor(() => {
      expect(retargetFromLifeStrategy).toHaveBeenCalledExactlyOnceWith("9244", {
        on: "Retire early",
      });
    });
    unmountScenario();

    vi.mocked(getOpened).mockResolvedValue({ isKept: false, name: "Dropped" });
    render(await page({ tab: "target-allocation" }));

    expect(
      screen.getByRole("region", { name: "Target allocation" }),
    ).toHaveTextContent(
      "Read from northstar.portfolio on Portfolio. Retargeting updates its Asset Allocation weights in place.",
    );
  });

  it("flags unsynced changes in a scenario when bookkeeping differs or targets are not synced yet", async () => {
    vi.mocked(getOpened).mockResolvedValue({
      isKept: true,
      name: "Retire early",
    });
    vi.mocked(getPortfolioFeed).mockResolvedValue(
      feedOf(
        saved({
          categories: syncedTargets.categories.map((category, index) =>
            index === 0
              ? { ...category, value: category.value + 100 }
              : category,
          ),
          portfolios: [],
        }),
      ),
    );

    const { unmount } = render(await page({ tab: "target-allocation" }));

    expect(screen.getByRole("note")).toHaveTextContent(
      "Portfolio file has newer holdings or categories",
    );
    unmount();

    vi.mocked(getHousehold).mockResolvedValue({ ...household, targets: null });
    render(await page({ tab: "target-allocation" }));

    expect(screen.getByText("No allocation synced yet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sync from Portfolio" }),
    ).toBeEnabled();
  });

  it("evaluates live-CMA blockers when unsynced targets introduce an unmapped category", async () => {
    const [first, ...rest] = syncedTargets.categories;
    vi.mocked(getHousehold).mockResolvedValue({ ...household, rateSet: "cma" });
    vi.mocked(getPortfolioFeed).mockResolvedValue(
      feedOf(
        saved({
          categories:
            first !== undefined
              ? [
                  { ...first, share: first.share - 0.05 },
                  ...rest,
                  {
                    classes: ["Equity"],
                    id: "unmapped-small-cap",
                    isImplemented: true,
                    name: "Global small cap",
                    share: 0.05,
                    value: 1000,
                  },
                ]
              : syncedTargets.categories,
          portfolios: [],
        }),
      ),
    );

    render(await page({ tab: "target-allocation" }));

    const button = screen.getByRole("button", { name: "Sync from Portfolio" });

    expect(screen.getByRole("note")).toHaveTextContent(
      "Portfolio file has unsynced changes",
    );
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      /this allocation cannot be synced while the plan runs on the CMA's rates/,
    );
  });

  // August's blends less the deductions run stocks at 7.84% in all and
  // bonds at 4.25%, so the target allocation's four fifths in stocks grow
  // at 7.52% with what rebalancing earns, which the sentence above the
  // cards reads off the plan the store hands it, 4.44% in today's money;
  // the rates and the split typed by hand are kept, not shown.
  it("says the CMA-derived rates are live and lays out their worksheet, with the target split in place of the split typed", async () => {
    vi.mocked(getHousehold).mockResolvedValue({
      ...household,
      plan: { ...retiring, inflation: 0.0295, rate: 0.075238 },
      rateSet: "cma",
    });

    render(await page());

    expect(
      within(screen.getByRole("banner")).getByText("CMA-derived rates"),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 })[0]?.textContent).toBe(
      "The plan rate is 7.52% a\u00a0year, 4.44% in today's\u00a0money at 2.95% inflation.",
    );
    expect(screen.getByRole("radio", { name: "From CMA" })).toBeChecked();
    expect(
      screen.getByRole("region", { name: "CMA-derived rates" }),
    ).toHaveTextContent("August 2026 CMA, data as of 30 Jun 2026");
    expect(screen.getByRole("textbox", { name: "Fee drag" })).toHaveValue(
      "0.20%",
    );
    expect(worksheet("CMA-derived rates, worked out")[0]).toStrictEqual([
      "Target weight",
      "80.00%",
      "20.00%",
      "100.00%",
    ]);
    expect(worksheet("CMA-derived rates, worked out")[5]).toStrictEqual([
      "Return",
      "7.84%",
      "4.25%",
      "7.52%",
    ]);
    expect(
      screen.queryByRole("textbox", { name: "Stocks share" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Inflation source" }),
    ).toHaveTextContent("Sect. VI.ii");
  });

  // The household thirty days ago, with the same sources, so nothing has
  // moved the rates since.
  it("sets the CMA's rates beside the household's sources as they stood thirty days before", async () => {
    vi.mocked(getHousehold).mockResolvedValue({ ...household, rateSet: "cma" });
    vi.mocked(getSourcesDaysAgo).mockResolvedValue({
      savedOn: "2026-09-07",
      sources: {
        cma: household.cma,
        curve,
        deductions: household.deductions,
        mappings,
        targets: syncedTargets,
      },
    });

    render(await page());

    expect(getSourcesDaysAgo).toHaveBeenCalledExactlyOnceWith(30);
    expect(
      screen.getByRole("region", { name: "What moved since 7 Sep 2026" }),
    ).toHaveTextContent("Nothing has moved the rates since 7 Sep 2026.");
  });
});
