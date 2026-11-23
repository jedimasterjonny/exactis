import type { JSX } from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { OwnedPortfolio } from "@/store/portfolio";

import { Toaster } from "@/components/kit/toast";
import { readPortfolioSnapshot } from "@/lib/portfolio-file";
import { samplePortfolioFile } from "@/lib/portfolio-file.fixture";
import { getOpened } from "@/store/household";
import { getPortfolio } from "@/store/portfolio";

import Portfolio, { metadata } from "./page";

vi.mock("@/actions/portfolio", () => ({ uploadPortfolio: vi.fn() }));
vi.mock("@/store/household", () => ({ getOpened: vi.fn() }));
vi.mock("@/store/portfolio", () => ({ getPortfolio: vi.fn() }));

const ownedSample: OwnedPortfolio = {
  savedOn: "2026-09-24",
  snapshot: readPortfolioSnapshot(samplePortfolioFile(), "northstar.portfolio"),
  version: 1,
};

async function portfolioPage(
  address: Record<string, string | string[]> = {},
): Promise<JSX.Element> {
  return Portfolio({ searchParams: Promise.resolve(address) });
}

describe("Portfolio", () => {
  it("titles the page by its label in the navigation", () => {
    expect(metadata).toStrictEqual({ title: "Portfolio" });
  });

  it("renders the empty state before a household portfolio file is stored", async () => {
    vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
    vi.mocked(getOpened).mockResolvedValue(null);
    vi.mocked(getPortfolio).mockResolvedValue(null);

    render(await portfolioPage(), { wrapper: Toaster });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Portfolio",
    );
    expect(screen.getByText("Sect. IX · Portfolio")).toHaveClass("label");
    expect(screen.getByText("No file uploaded")).toBeInTheDocument();
    expect(screen.getByText("No portfolio file uploaded")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload .portfolio file" }),
    ).toBeEnabled();
  });

  it("renders the server-loaded owned portfolio unlocked on Holdings by default and respects ?tab=accounts", async () => {
    vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
    vi.mocked(getOpened).mockResolvedValue(null);
    vi.mocked(getPortfolio).mockResolvedValue(ownedSample);

    const { unmount } = render(await portfolioPage(), { wrapper: Toaster });

    expect(
      screen.getByText("northstar.portfolio · GBP · Saved 24 Sep 2026"),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Holdings" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("button", { name: "Add security" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Replace file…" })).toBeEnabled();

    unmount();

    render(await portfolioPage({ tab: "accounts" }), { wrapper: Toaster });

    expect(screen.getByRole("tab", { name: "Accounts" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("locks replacement and preview additions when a scenario is open", async () => {
    vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
    vi.mocked(getOpened).mockResolvedValue({
      isKept: true,
      name: "Retiring early",
    });
    vi.mocked(getPortfolio).mockResolvedValue(ownedSample);

    render(await portfolioPage({ tab: ["accounts"] }), { wrapper: Toaster });

    expect(
      screen.getByText("Portfolio belongs to the household"),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Holdings" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Replace file…" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add security" })).toBeDisabled();
  });
});
