import type { ComponentProps } from "react";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Sources } from "@/data/household";

import { derivedSet } from "@/data/cma";
import { cma, mappings } from "@/data/cma.fixture";
import { curve } from "@/data/inflation.fixture";
import { planRate } from "@/data/rates";
import { targets, targetsUnder } from "@/data/targets.fixture";
import { formatPercent } from "@/lib/money";
import { worksheet } from "@/test/dom";

import { CmaWorksheet } from "./cma-worksheet";

// The worksheet's name.
const sheet = "CMA-derived rates, worked out";

// The body's own sources, as the store would keep them.
const sources: Sources = {
  cma: { latest: cma, previous: null },
  curve,
  deductions: { dividends: 0.02, fees: 0.002 },
  mappings,
  targets,
};

// The body over the reference household's sources, August's vintage,
// the first of September's curve, its target allocation and mappings,
// and 0.20% of fees and a 2% yield, with no fields at its head, and
// with what is given in their place.
function renderSheet(
  given: Partial<ComponentProps<typeof CmaWorksheet>> = {},
): void {
  render(
    <CmaWorksheet
      before={null}
      cma={{ latest: cma, previous: null }}
      curve={curve}
      deductions={{ dividends: 0.02, fees: 0.002 }}
      fields={null}
      mappings={mappings}
      split={null}
      targets={targets}
      {...given}
    />,
  );
}

describe("CmaWorksheet", () => {
  // Four fifths in stocks blending to 8.044% and a fifth in bonds to
  // 4.466%, with 0.015 of a point of hedging on bonds, less 0.20% of
  // fees, 7.84% and 4.25%, which blend to 7.13%; rebalancing earns 0.205
  // of a point within stocks and 0.020 within bonds, and the portfolio
  // those in four fifths and a fifth and 0.231 between the two, 0.398,
  // so it returns 7.52%, which is the plan rate. Stocks' 2% yield leaves
  // 5.84% of growth, a fifth of which the portfolio holds none of, and
  // the portfolio's growth carries the rebalancing, so its growth and
  // yield still add up; over the curve's 2.95% the three come to 4.75%,
  // 1.26% and 4.44%. Every other portfolio figure is the sleeves' in
  // four fifths and a fifth.
  it("works the vintage out by the target allocation down to the real return, a column a sleeve and one for the portfolio", () => {
    renderSheet();

    expect(
      within(screen.getByRole("table", { name: sheet }))
        .getAllByRole("columnheader")
        .map((heading) => heading.textContent),
    ).toStrictEqual(["Stocks", "Bonds", "Portfolio"]);
    expect(worksheet(sheet)).toStrictEqual([
      ["Target weight", "80.00%", "20.00%", "100.00%"],
      ["Blended 20y GBP return", "8.044%", "4.466%", "7.328%"],
      ["GBP-hedging adjustment", "—", "−0.015pp", "−0.003pp"],
      ["Fee drag", "−0.200pp", "−0.200pp", "−0.200pp"],
      ["Rebalancing", "0.205pp", "0.020pp", "0.398pp"],
      ["Return", "7.84%", "4.25%", "7.52%"],
      ["Growth", "5.84%", "4.25%", "5.92%"],
      ["Dividend yield", "2.00%", "—", "1.60%"],
      ["Real return", "4.75%", "1.26%", "4.44%"],
    ]);
  });

  it("says beneath the real return the inflation it is over, and beneath no other row anything", () => {
    renderSheet();

    const row = (name: string): HTMLElement =>
      screen.getByRole("rowheader", { name });

    expect(row("Blended 20y GBP return")).not.toHaveAccessibleDescription();
    expect(row("Return")).not.toHaveAccessibleDescription();
    expect(row("Real return")).toHaveAccessibleDescription(
      "Over 2.95% inflation",
    );
  });

  // A vintage pulled before its volatilities were read gives no risk to
  // work the rebalancing from, so the row is left out and the return is
  // the blend alone, 7.13%, as the plan then runs.
  it("leaves the rebalancing out while the vintage gives no risk, the return the blend alone", () => {
    renderSheet({
      cma: {
        latest: {
          asOf: cma.asOf,
          assets: cma.assets.map(({ name, rate, sleeve }) => ({
            name,
            rate,
            sleeve,
          })),
          vintage: cma.vintage,
        },
        previous: null,
      },
    });

    expect(
      screen.queryByRole("rowheader", { name: "Rebalancing" }),
    ).not.toBeInTheDocument();
    expect(worksheet(sheet)).toContainEqual([
      "Return",
      "7.84%",
      "4.25%",
      "7.13%",
    ]);
  });

  // All in equities, bonds stand in at stocks' return and weigh nothing,
  // so their column is dashed and the portfolio is stocks alone, earning
  // by rebalancing what stocks earn within themselves and nothing
  // between the sleeves. Nothing hedged is held, so there is no hedging
  // row.
  it("dashes a sleeve nothing in the target allocation blends into", () => {
    renderSheet({ targets: targetsUnder("Equity") });

    expect(worksheet(sheet)).toStrictEqual([
      ["Target weight", "100.00%", "0.00%", "100.00%"],
      ["Blended 20y GBP return", "8.044%", "—", "8.044%"],
      ["Fee drag", "−0.200pp", "—", "−0.200pp"],
      ["Rebalancing", "0.205pp", "—", "0.205pp"],
      ["Return", "7.84%", "—", "8.05%"],
      ["Growth", "5.84%", "—", "6.05%"],
      ["Dividend yield", "2.00%", "—", "2.00%"],
      ["Real return", "4.75%", "—", "4.95%"],
    ]);
  });

  // All in bonds, stocks have no yield to pay, so the portfolio's is
  // nothing, and rebalancing earns the 0.020 of a point bonds earn
  // within themselves.
  it("dashes stocks, yield and all, when nothing blends into them", () => {
    renderSheet({ targets: targetsUnder("Bonds") });

    expect(worksheet(sheet)).toStrictEqual([
      ["Target weight", "0.00%", "100.00%", "100.00%"],
      ["Blended 20y GBP return", "—", "4.466%", "4.466%"],
      ["GBP-hedging adjustment", "—", "−0.015pp", "−0.015pp"],
      ["Fee drag", "—", "−0.200pp", "−0.200pp"],
      ["Rebalancing", "—", "0.020pp", "0.020pp"],
      ["Return", "—", "4.25%", "4.27%"],
      ["Growth", "—", "4.25%", "4.27%"],
      ["Dividend yield", "—", "—", "0.00%"],
      ["Real return", "—", "1.26%", "1.28%"],
    ]);
  });

  it("dashes the real return before a curve is pulled", () => {
    renderSheet({ curve: null });

    expect(worksheet(sheet).at(-1)).toStrictEqual([
      "Real return",
      "—",
      "—",
      "—",
    ]);
    expect(
      screen.getByRole("rowheader", { name: "Real return" }),
    ).toHaveAccessibleDescription("Once a BoE curve is pulled");
  });

  // Each category under the sleeve its class blends into, in the file's
  // order. FTSE USA asks for nothing and has no class, so it blends
  // into neither and is left out; FTSE All-Share asks for nothing too,
  // and is muted under stocks.
  it("lays every category's share of the whole beneath the worksheet under the sleeve it blends into, a share of nothing muted", () => {
    renderSheet();

    const weights = screen.getByRole("region", { name: "Target weights" });
    const stocks = within(weights).getByRole("group", { name: "Stocks" });
    const terms = within(stocks).getAllByRole("term");
    const shares = within(stocks).getAllByRole("definition");

    expect(terms.map((term) => term.textContent)).toStrictEqual([
      "FTSE Global All Cap ex-UK",
      "Global emerging markets",
      "UK equity",
      "Global small cap",
      "FTSE All-Share",
    ]);
    expect(
      within(within(weights).getByRole("group", { name: "Bonds" }))
        .getAllByRole("term")
        .map((term) => term.textContent),
    ).toStrictEqual([
      "Global bonds, hedged",
      "Index-linked gilts",
      "Short-dated gilts",
    ]);
    expect(shares[0]).toHaveTextContent("48.00%");
    expect(shares[0]).not.toHaveClass("text-muted-foreground");
    expect(shares[4]).toHaveTextContent("0.00%");
    expect(shares[4]).toHaveClass("text-muted-foreground");
    expect(terms[4]).toHaveClass("text-muted-foreground");
  });

  // The glide path holds 85% in stocks now: the sleeves blend as they
  // did, and the portfolio holds them at 85/15, coming to the plan rate
  // the plan grows at now. FTSE Global All Cap ex-UK's 48% of a
  // four-fifths sleeve is 51% of an 85% one, and global bonds' 14% of a
  // fifth is 10.5% of 15%. What moved is read at 85/15 too.
  it("works the vintage out at the glide path's split now, scaling each category's share with its sleeve's", () => {
    const split = { stocks: 0.85 };
    const derived = derivedSet(sources, split);
    const planRateNow =
      "short" in derived
        ? null
        : formatPercent(
            planRate(derived.rates, derived.allocation, derived.rebalancing),
          );
    renderSheet({
      before: {
        savedOn: "2026-09-01",
        sources: { ...sources, deductions: { dividends: 0.02, fees: 0.001 } },
      },
      split,
    });

    const rows = worksheet(sheet);
    const weights = screen.getByRole("region", { name: "Glide path weights" });

    expect(rows[0]).toStrictEqual([
      "Glide path weight",
      "85.00%",
      "15.00%",
      "100.00%",
    ]);
    expect(rows.find(([label]) => label === "Return")?.[3]).toBe(planRateNow);
    expect(
      within(
        within(weights).getByRole("group", { name: "Stocks" }),
      ).getAllByRole("definition")[0],
    ).toHaveTextContent("51.00%");
    expect(
      within(
        within(weights).getByRole("group", { name: "Bonds" }),
      ).getAllByRole("definition")[0],
    ).toHaveTextContent("10.50%");
    expect(
      worksheet(
        "What moved the rates, worked out",
        screen.getByRole("region", { name: "What moved since 1 Sep 2026" }),
      ).at(-1),
    ).toStrictEqual(["Now", planRateNow, "2.95%", expect.any(String)]);
  });

  // On the first of September the fees were a tenth of a point less, so
  // the plan rate was 7.62% where it is 7.52% now, each with the 0.398
  // of a point rebalancing earns, 4.54% real where it is 4.44%, at the
  // same 2.95% of inflation.
  it("lays out what moved the rates since the household stood a while ago, adding up down the columns", () => {
    renderSheet({
      before: {
        savedOn: "2026-09-01",
        sources: { ...sources, deductions: { dividends: 0.02, fees: 0.001 } },
      },
    });

    const moved = screen.getByRole("region", {
      name: "What moved since 1 Sep 2026",
    });

    expect(worksheet("What moved the rates, worked out", moved)).toStrictEqual([
      ["Then", "7.62%", "2.95%", "4.54%"],
      ["Fees and yield", "−0.10pp", "0.00pp", "−0.10pp"],
      ["Now", "7.52%", "2.95%", "4.44%"],
    ]);
  });

  // Since the first of September UK cash has gone from the vintage and
  // short-dated gilts have been mapped onto global aggregate bonds
  // instead: the vintage alone leaves the gilts on a class it no longer
  // prices, so the two are one row.
  it("names the sources a step takes together, where the first alone derives no rates", () => {
    const gilts = targets.categories.find(
      ({ name }) => name === "Short-dated gilts",
    );
    renderSheet({
      before: { savedOn: "2026-09-01", sources },
      cma: {
        latest: {
          ...cma,
          assets: cma.assets.filter(({ name }) => name !== "UK cash"),
        },
        previous: cma,
      },
      mappings: mappings.map((mapping) =>
        mapping.category === gilts?.id
          ? { ...mapping, asset: "Global aggregate bonds" }
          : mapping,
      ),
    });

    expect(
      screen.getByRole("rowheader", {
        name: "BlackRock CMA and Target allocation",
      }),
    ).toBeInTheDocument();
  });

  it("says nothing has moved the rates where no source has changed", () => {
    renderSheet({ before: { savedOn: "2026-09-01", sources } });

    expect(
      screen.getByRole("region", { name: "What moved since 1 Sep 2026" }),
    ).toHaveTextContent("Nothing has moved the rates since 1 Sep 2026.");
    expect(
      screen.queryByRole("table", { name: "What moved the rates, worked out" }),
    ).not.toBeInTheDocument();
  });

  it("leaves out what moved where the sources then derived no rates, or there are none to compare", () => {
    renderSheet({
      before: { savedOn: "2026-09-01", sources: { ...sources, cma: null } },
    });

    expect(
      screen.queryByRole("region", { name: /^What moved/ }),
    ).not.toBeInTheDocument();
  });

  it("sets the fields it is given at its head", () => {
    renderSheet({ fields: <span>The deductions</span> });

    expect(screen.getByText("The deductions")).toBeInTheDocument();
  });

  it("says nothing has been pulled before a vintage is", () => {
    renderSheet({ cma: null });

    expect(screen.getByText("No CMA pulled yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("says nothing is worked out before a target allocation is imported", () => {
    renderSheet({ targets: null });

    expect(screen.getByText("No allocation imported yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("says what keeps the vintage from being blended, in the caution tone", () => {
    renderSheet({ mappings: mappings.slice(1) });

    expect(screen.getByRole("note")).toHaveTextContent(
      "The CMA cannot be blended yetFTSE Global All Cap ex-UK has no CMA class. Fix it on the Target allocation tab.",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
