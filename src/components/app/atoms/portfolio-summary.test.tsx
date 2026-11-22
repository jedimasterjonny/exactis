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
  it("shows invested value, uninvested cash, active account counts, and quote freshness", () => {
    render(
      <PortfolioSummary
        cashAccountCount={3}
        latestQuoteDate="2026-09-22"
        securitiesAccountCount={2}
        today="2026-09-25"
        totalCash={1250.4}
        totalInvested={42_150.25}
      />,
    );

    expect(readings()).toStrictEqual([
      ["Invested", "£42,150.25"],
      ["Uninvested cash", "£1,250.40"],
      ["Accounts", "2 securities · 3 cash"],
      ["Quotes to", "22 Sep 2026 · 3 days old"],
    ]);

    const definitions = screen.getAllByRole("definition");
    expect(definitions[0]).toHaveClass("figure");
    expect(definitions[1]).toHaveClass("figure");
    expect(definitions[2]).not.toHaveClass("figure");
    expect(definitions[3]).not.toHaveClass("figure");
  });

  it("says when the file holds no dated quotes yet", () => {
    render(
      <PortfolioSummary
        cashAccountCount={0}
        latestQuoteDate={null}
        securitiesAccountCount={1}
        today="2026-09-25"
        totalCash={0}
        totalInvested={0}
      />,
    );

    expect(readings()).toContainEqual(["Quotes to", "No quotes yet"]);
  });

  it("formats a quote date ahead of today as a plain date without negative age", () => {
    render(
      <PortfolioSummary
        cashAccountCount={1}
        latestQuoteDate="2026-09-26"
        securitiesAccountCount={1}
        today="2026-09-25"
        totalCash={100}
        totalInvested={1000}
      />,
    );

    expect(readings()).toContainEqual(["Quotes to", "26 Sep 2026"]);
  });
});
