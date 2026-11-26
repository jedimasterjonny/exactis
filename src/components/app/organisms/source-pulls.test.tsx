import type { ComponentProps } from "react";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { accounts } from "@/data/accounts.fixture";
import { cma } from "@/data/cma.fixture";
import { kept } from "@/data/household.fixture";
import { house, houseLoan } from "@/data/houses.fixture";
import { curve } from "@/data/inflation.fixture";

import type { PortfolioSource } from "./source-pulls";

import { SourcePulls } from "./source-pulls";

vi.mock("@/actions/cma", () => ({ pullCma: vi.fn() }));
vi.mock("@/actions/inflation", () => ({ pullCurve: vi.fn() }));
vi.mock("@/actions/house-prices", () => ({ pullHousePrices: vi.fn() }));
vi.mock("@/actions/targets", () => ({ syncTargetsFromPortfolio: vi.fn() }));

// The reference household on the CMA's rates, its home the house it is,
// with its mortgage against it, read at October 2026's close on the
// 26th: August's vintage, a curve of the 23rd, and the index to August,
// pulled on the 24th, each as current as it should be.
const current = {
  ...kept,
  accounts: [...accounts.slice(0, 3), house, houseLoan],
  cma: { latest: cma, previous: null },
  curve: { ...curve, asOf: "2026-10-23" },
  housePrices: {
    from: { month: 9, year: 2021 },
    pulledOn: "2026-10-24",
    to: { month: 7, year: 2026 },
  },
  rateSet: "cma",
} satisfies ComponentProps<typeof SourcePulls>["household"];

// A current, synced portfolio file for October 2026's close (cut on
// Friday 23 October 2026).
const syncedPortfolio: PortfolioSource = {
  kind: "synced",
  latestQuoteDate: "2026-10-23",
  latestTransactionDate: "2026-10-15",
  savedOn: "2026-10-24",
};

// The section over the household and portfolio given, at October 2026's
// close.
function openSources(
  household: ComponentProps<typeof SourcePulls>["household"] = current,
  portfolio: ComponentProps<typeof SourcePulls>["portfolio"] = syncedPortfolio,
): HTMLElement {
  render(
    <SourcePulls
      household={household}
      month={{ month: 9, year: 2026 }}
      portfolio={portfolio}
      today="2026-10-26"
    />,
  );
  return screen.getByRole("region", { name: "Sources" });
}

// Every paragraph's text in a source group, in order: name with any
// badge, date/status line, and optional note.
function paragraphs(group: HTMLElement): (null | string)[] {
  return within(group)
    .getAllByRole("paragraph")
    .map(({ textContent }) => textContent);
}

// Each row's lines, its name with its badge, then what is held and any
// note, and the actions it offers.
function rows(section: HTMLElement): (null | string)[][] {
  return within(section)
    .getAllByRole("group")
    .map((group) => [
      ...paragraphs(group),
      ...[
        ...within(group).queryAllByRole("button"),
        ...within(group).queryAllByRole("link"),
      ].map(({ textContent }) => textContent),
    ]);
}

describe("SourcePulls", () => {
  it("heads the worksheet with the sources, each named, with what is held and its action, and no badge while each is current", () => {
    const section = openSources();

    expect(
      within(section).getByRole("heading", { name: "Sources" }),
    ).toHaveClass("label");
    expect(rows(section)).toStrictEqual([
      [
        "BlackRock CMA",
        "Aug 2026, data 30 Jun 2026 · 118 days old",
        "Pull CMA workbook",
      ],
      ["BoE curve", "23 Oct 2026 · 3 days old", "Pull latest curve"],
      [
        "House prices",
        "Indexed to Aug 2026, pulled 24 Oct 2026",
        "Pull house prices",
      ],
      [
        "Portfolio",
        "Quotes to 23 Oct 2026 · Last transaction 15 Oct 2026",
        "Open Portfolio",
      ],
    ]);
    expect(
      within(section).getByRole("group", { name: "BoE curve" }),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("group", { name: "Portfolio" }),
    ).toBeInTheDocument();
    expect(within(section).queryByText("Stale")).not.toBeInTheDocument();
    expect(within(section).queryByText("Not synced")).not.toBeInTheDocument();
    expect(
      within(section).getByRole("button", { name: "Pull house prices" }),
    ).toBeEnabled();
    expect(
      within(section).getByRole("link", { name: "Open Portfolio" }),
    ).toHaveAttribute("href", "/portfolio");
  });

  // May's vintage is five months before October, and the index to July
  // three, pulled before October's cut on the 23rd.
  it("marks each source stale in its name, where a newer one should be out", () => {
    const section = openSources({
      ...current,
      cma: {
        latest: {
          ...cma,
          asOf: "2026-03-31",
          vintage: { month: 4, year: 2026 },
        },
        previous: null,
      },
      housePrices: {
        ...current.housePrices,
        pulledOn: "2026-09-15",
        to: { month: 6, year: 2026 },
      },
    });

    expect(rows(section)).toStrictEqual([
      [
        "BlackRock CMAStale",
        "May 2026, data 31 Mar 2026 · 209 days old",
        "Pull CMA workbook",
      ],
      ["BoE curve", "23 Oct 2026 · 3 days old", "Pull latest curve"],
      [
        "House pricesStale",
        "Indexed to Jul 2026, pulled 15 Sep 2026",
        "Pull house prices",
      ],
      [
        "Portfolio",
        "Quotes to 23 Oct 2026 · Last transaction 15 Oct 2026",
        "Open Portfolio",
      ],
    ]);
    expect(
      within(section).getByRole("group", { name: /^BlackRock CMA\s?Stale$/u }),
    ).toBeInTheDocument();
    expect(
      within(
        within(section).getByRole("group", { name: /^House prices\s?Stale$/u }),
      ).getByText("Stale"),
    ).toHaveAttribute("data-variant", "caution");
  });

  it("says a source is not pulled or uploaded yet, with no badge", () => {
    const section = openSources(
      { ...current, cma: null, curve: null, housePrices: null },
      null,
    );

    expect(rows(section)).toStrictEqual([
      ["BlackRock CMA", "Not pulled yet", "Pull CMA workbook"],
      ["BoE curve", "Not pulled yet", "Pull latest curve"],
      ["House prices", "Not pulled yet", "Pull house prices"],
      ["Portfolio", "Not uploaded yet", "Upload on Portfolio"],
    ]);
    expect(within(section).queryByText("Stale")).not.toBeInTheDocument();
    expect(within(section).queryByText("Not synced")).not.toBeInTheDocument();
    expect(
      within(section).getByRole("link", { name: "Upload on Portfolio" }),
    ).toHaveAttribute("href", "/portfolio");
  });

  // Nothing the custom rates run on reads the curve, however old.
  it("offers no curve under the custom rates", () => {
    const section = openSources({ ...current, curve, rateSet: "custom" });

    expect(rows(section).map((row) => row.at(-1))).toStrictEqual([
      "Pull CMA workbook",
      "Pull house prices",
      "Open Portfolio",
    ]);
  });

  // The reference household's home is a real asset rather than a house.
  it("offers no house prices where no house is listed", () => {
    const section = openSources({ ...current, accounts });

    expect(rows(section).map((row) => row.at(-1))).toStrictEqual([
      "Pull CMA workbook",
      "Pull latest curve",
      "Open Portfolio",
    ]);
  });

  it("formats quote-only and transaction-only portfolio date lines when fresh and synced", () => {
    const { rerender } = render(
      <SourcePulls
        household={current}
        month={{ month: 9, year: 2026 }}
        portfolio={{
          kind: "synced",
          latestQuoteDate: "2026-10-23",
          latestTransactionDate: null,
          savedOn: "2026-10-24",
        }}
        today="2026-10-26"
      />,
    );
    const section = screen.getByRole("region", { name: "Sources" });

    expect(
      paragraphs(within(section).getByRole("group", { name: "Portfolio" })),
    ).toStrictEqual(["Portfolio", "Quotes to 23 Oct 2026 · No transactions"]);

    rerender(
      <SourcePulls
        household={current}
        month={{ month: 9, year: 2026 }}
        portfolio={{
          kind: "synced",
          latestQuoteDate: null,
          latestTransactionDate: "2026-10-23",
          savedOn: "2026-10-24",
        }}
        today="2026-10-26"
      />,
    );

    expect(
      paragraphs(within(section).getByRole("group", { name: "Portfolio" })),
    ).toStrictEqual([
      "Portfolio",
      "No quotes yet · Last transaction 23 Oct 2026",
    ]);
  });

  it("marks a stale portfolio row with Stale, links to Portfolio, and hides sync even when unsynced", () => {
    const section = openSources(current, {
      blockedReason: "Map categories before syncing",
      kind: "unsynced",
      latestQuoteDate: null,
      latestTransactionDate: null,
      savedOn: "2026-10-24",
    });
    const group = within(section).getByRole("group", {
      name: /^Portfolio\s?Stale$/u,
    });

    expect(within(group).getByText("Stale")).toHaveAttribute(
      "data-variant",
      "caution",
    );
    expect(paragraphs(group)).toStrictEqual([
      "PortfolioStale",
      "No quotes or transactions yet",
    ]);
    expect(
      within(group).getByRole("link", { name: "Open Portfolio" }),
    ).toHaveAttribute("href", "/portfolio");
    expect(
      within(group).queryByRole("button", { name: "Sync from Portfolio" }),
    ).not.toBeInTheDocument();
  });

  it("shows Not synced and the refusal note when a fresh portfolio file cannot be synced", () => {
    const section = openSources(current, {
      kind: "refused",
      latestQuoteDate: "2026-10-23",
      latestTransactionDate: "2026-10-15",
      reason: "Asset Allocation taxonomy not found",
      savedOn: "2026-10-24",
    });
    const group = within(section).getByRole("group", {
      name: /^Portfolio\s?Not synced$/u,
    });

    expect(within(group).getByText("Not synced")).toHaveAttribute(
      "data-variant",
      "caution",
    );
    expect(paragraphs(group)).toStrictEqual([
      "PortfolioNot synced",
      "Quotes to 23 Oct 2026 · Last transaction 15 Oct 2026",
      "Asset Allocation taxonomy not found",
    ]);
    expect(
      within(group).getByRole("link", { name: "Open Portfolio" }),
    ).toHaveAttribute("href", "/portfolio");
    expect(
      within(group).queryByRole("button", { name: "Sync from Portfolio" }),
    ).not.toBeInTheDocument();
  });

  it("surfaces Not synced and the refusal note ahead of Stale when a stale portfolio file is refused", () => {
    const section = openSources(current, {
      kind: "refused",
      latestQuoteDate: "2026-09-20",
      latestTransactionDate: "2026-09-15",
      reason: "Asset Allocation taxonomy not found",
      savedOn: "2026-09-21",
    });
    const group = within(section).getByRole("group", {
      name: /^Portfolio\s?Not synced$/u,
    });

    expect(within(group).getByText("Not synced")).toHaveAttribute(
      "data-variant",
      "caution",
    );
    expect(within(group).queryByText("Stale")).not.toBeInTheDocument();
    expect(paragraphs(group)).toStrictEqual([
      "PortfolioNot synced",
      "Quotes to 20 Sep 2026 · Last transaction 15 Sep 2026",
      "Asset Allocation taxonomy not found",
    ]);
    expect(
      within(group).getByRole("link", { name: "Open Portfolio" }),
    ).toHaveAttribute("href", "/portfolio");
    expect(
      within(group).queryByRole("button", { name: "Sync from Portfolio" }),
    ).not.toBeInTheDocument();
  });

  it("offers an enabled Sync from Portfolio button beside Open Portfolio when fresh and unsynced", () => {
    const section = openSources(current, {
      kind: "unsynced",
      latestQuoteDate: "2026-10-23",
      latestTransactionDate: "2026-10-15",
      savedOn: "2026-10-24",
    });
    const group = within(section).getByRole("group", {
      name: /^Portfolio\s?Not synced$/u,
    });
    const syncButton = within(group).getByRole("button", {
      name: "Sync from Portfolio",
    });

    expect(within(group).getByText("Not synced")).toHaveAttribute(
      "data-variant",
      "caution",
    );
    expect(paragraphs(group)).toStrictEqual([
      "PortfolioNot synced",
      "Quotes to 23 Oct 2026 · Last transaction 15 Oct 2026",
    ]);
    expect(syncButton).toBeEnabled();
    expect(syncButton).not.toHaveAttribute("aria-describedby");
    expect(
      within(group).getByRole("link", { name: "Open Portfolio" }),
    ).toHaveAttribute("href", "/portfolio");
  });

  it("disables Sync from Portfolio and wires aria-describedby to the blocker note", () => {
    const blockedReason = "Switch to custom rates before syncing";
    const section = openSources(current, {
      blockedReason,
      kind: "unsynced",
      latestQuoteDate: "2026-10-23",
      latestTransactionDate: "2026-10-15",
      savedOn: "2026-10-24",
    });
    const group = within(section).getByRole("group", {
      name: /^Portfolio\s?Not synced$/u,
    });
    const syncButton = within(group).getByRole("button", {
      name: "Sync from Portfolio",
    });

    expect(within(group).getByText("Not synced")).toHaveAttribute(
      "data-variant",
      "caution",
    );
    expect(paragraphs(group)).toStrictEqual([
      "PortfolioNot synced",
      "Quotes to 23 Oct 2026 · Last transaction 15 Oct 2026",
      blockedReason,
    ]);
    expect(syncButton).toBeDisabled();
    expect(syncButton).toHaveAccessibleDescription(blockedReason);
    expect(
      within(group).getByRole("link", { name: "Open Portfolio" }),
    ).toHaveAttribute("href", "/portfolio");
  });
});
