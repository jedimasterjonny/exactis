import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PortfolioSummary } from "./portfolio-summary";

function readings(): readonly (readonly [null | string, null | string])[] {
  const values = screen.getAllByRole("definition");
  return screen
    .getAllByRole("term")
    .map((term, place) => [
      term.textContent,
      values[place]?.textContent ?? null,
    ]);
}

describe("PortfolioSummary", () => {
  it("shows invested value, uninvested cash, held securities count, and quote freshness", () => {
    render(
      <PortfolioSummary
        holdingsCount={8}
        latestQuoteDate="2026-09-22"
        today="2026-09-25"
        totalCash={1250.4}
        totalInvested={42_150.25}
      />,
    );

    expect(readings()).toStrictEqual([
      ["Invested", "£42,150.25"],
      ["Uninvested cash", "£1,250.40"],
      ["Holdings", "8 securities"],
      ["Quotes to", "22 Sep 2026 · 3 days old"],
    ]);

    const definitions = screen.getAllByRole("definition");
    expect(definitions[0]).toHaveClass("figure");
    expect(definitions[1]).toHaveClass("figure");
    expect(definitions[2]).not.toHaveClass("figure");
    expect(definitions[3]).not.toHaveClass("figure");
  });

  it("uses singular security for one holding and says when the file holds no dated quotes yet", () => {
    render(
      <PortfolioSummary
        holdingsCount={1}
        latestQuoteDate={null}
        today="2026-09-25"
        totalCash={0}
        totalInvested={0}
      />,
    );

    expect(readings()).toContainEqual(["Holdings", "1 security"]);
    expect(readings()).toContainEqual(["Quotes to", "No quotes yet"]);
  });

  it("formats a quote date ahead of today as a plain date without negative age", () => {
    render(
      <PortfolioSummary
        holdingsCount={2}
        latestQuoteDate="2026-09-26"
        today="2026-09-25"
        totalCash={100}
        totalInvested={1000}
      />,
    );

    expect(readings()).toContainEqual(["Quotes to", "26 Sep 2026"]);
  });
});
