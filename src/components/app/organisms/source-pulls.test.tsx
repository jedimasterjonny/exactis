import type { ComponentProps } from "react";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { accounts } from "@/data/accounts.fixture";
import { cma } from "@/data/cma.fixture";
import { kept } from "@/data/household.fixture";
import { house, houseLoan } from "@/data/houses.fixture";
import { curve } from "@/data/inflation.fixture";

import { SourcePulls } from "./source-pulls";

vi.mock("@/actions/cma", () => ({ pullCma: vi.fn() }));
vi.mock("@/actions/inflation", () => ({ pullCurve: vi.fn() }));
vi.mock("@/actions/house-prices", () => ({ pullHousePrices: vi.fn() }));

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

// The section over the household given, at October 2026's close.
function openSources(
  household: ComponentProps<typeof SourcePulls>["household"] = current,
): HTMLElement {
  render(
    <SourcePulls
      household={household}
      month={{ month: 9, year: 2026 }}
      today="2026-10-26"
    />,
  );
  return screen.getByRole("region", { name: "Sources" });
}

// Each row's lines, its name with its badge, then what is held, and the
// pull it offers.
function rows(section: HTMLElement): (null | string)[][] {
  return within(section)
    .getAllByRole("group")
    .map((group) => [
      ...within(group)
        .getAllByRole("paragraph")
        .map(({ textContent }) => textContent),
      within(group).getByRole("button").textContent,
    ]);
}

describe("SourcePulls", () => {
  it("heads the worksheet with the sources, each named, with what is held and its pull, and no badge while each is current", () => {
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
    ]);
    expect(
      within(section).getByRole("group", { name: "BoE curve" }),
    ).toBeInTheDocument();
    expect(within(section).queryByText("Stale")).not.toBeInTheDocument();
    expect(
      within(section).getByRole("button", { name: "Pull house prices" }),
    ).toBeEnabled();
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

  it("says a source is not pulled yet, with no badge", () => {
    const section = openSources({
      ...current,
      cma: null,
      curve: null,
      housePrices: null,
    });

    expect(rows(section)).toStrictEqual([
      ["BlackRock CMA", "Not pulled yet", "Pull CMA workbook"],
      ["BoE curve", "Not pulled yet", "Pull latest curve"],
      ["House prices", "Not pulled yet", "Pull house prices"],
    ]);
    expect(within(section).queryByText("Stale")).not.toBeInTheDocument();
  });

  // Nothing the custom rates run on reads the curve, however old.
  it("offers no curve under the custom rates", () => {
    const section = openSources({ ...current, curve, rateSet: "custom" });

    expect(
      within(section)
        .getAllByRole("group")
        .map((group) => within(group).getByRole("button").textContent),
    ).toStrictEqual(["Pull CMA workbook", "Pull house prices"]);
  });

  // The reference household's home is a real asset rather than a house.
  it("offers no house prices where no house is listed", () => {
    const section = openSources({ ...current, accounts });

    expect(
      within(section)
        .getAllByRole("group")
        .map((group) => within(group).getByRole("button").textContent),
    ).toStrictEqual(["Pull CMA workbook", "Pull latest curve"]);
  });
});
