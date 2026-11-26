import type { JSX } from "react";

import { render, screen, within } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OwnedPortfolio } from "@/store/portfolio";

import { Toaster } from "@/components/kit/toast";
import { readPortfolioSnapshot } from "@/lib/portfolio-file";
import { samplePortfolioFile } from "@/lib/portfolio-file.fixture";
import { getOpened } from "@/store/household";
import { getPortfolio } from "@/store/portfolio";

import Portfolio, { metadata } from "./page";

vi.mock("@/actions/portfolio", () => ({
  addPortfolioAccount: vi.fn(),
  addPortfolioSecurity: vi.fn(),
  addPortfolioTransaction: vi.fn(),
  updatePortfolioQuotes: vi.fn(),
  uploadPortfolio: vi.fn(),
}));
vi.mock("@/store/household", () => ({ getOpened: vi.fn() }));
vi.mock("@/store/portfolio", () => ({ getPortfolio: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

const routerReplace = vi.fn<ReturnType<typeof useRouter>["replace"]>();

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
  beforeEach(() => {
    routerReplace.mockClear();
    vi.mocked(useRouter).mockReturnValue({
      back: vi.fn<() => void>(),
      bfcacheId: "",
      forward: vi.fn<() => void>(),
      prefetch: vi.fn<() => void>(),
      push: vi.fn<() => void>(),
      refresh: vi.fn<() => void>(),
      replace: routerReplace,
    });
  });
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
    expect(screen.getByRole("button", { name: "Update quotes" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Replace file…" })).toBeEnabled();

    unmount();

    render(await portfolioPage({ tab: "accounts" }), { wrapper: Toaster });

    expect(screen.getByRole("tab", { name: "Accounts" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("locks replacement and write-back actions when a scenario is open", async () => {
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
    expect(
      screen.getByRole("button", { name: "Update quotes" }),
    ).toBeDisabled();
  });

  it("opens on Transactions with a prefilled dialog for valid purchase and sale handoff query params", async () => {
    vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
    vi.mocked(getOpened).mockResolvedValue(null);
    vi.mocked(getPortfolio).mockResolvedValue(ownedSample);

    const { unmount } = render(
      await portfolioPage({
        amount: "1250",
        portfolio: "port-isa",
        security: "sec-world",
        tab: "accounts",
        trade: "purchase",
      }),
      { wrapper: Toaster },
    );

    expect(
      screen.getByRole("tab", { hidden: true, name: "Transactions" }),
    ).toHaveAttribute("aria-selected", "true");
    const purchaseDialog = screen.getByRole("dialog", {
      name: "Purchase · Global Equity Index",
    });
    expect(
      within(purchaseDialog).getByRole("combobox", { name: "Type" }),
    ).toHaveValue("purchase");
    expect(
      within(purchaseDialog).getByRole("combobox", {
        name: "Securities account",
      }),
    ).toHaveValue("port-isa");
    expect(
      within(purchaseDialog).getByRole("combobox", { name: "Cash account" }),
    ).toHaveValue("cash-isa");
    expect(
      within(purchaseDialog).getByRole("combobox", { name: "Security" }),
    ).toHaveValue("sec-world");
    expect(
      within(purchaseDialog).getByRole("textbox", { name: "Total paid" }),
    ).toHaveValue("£1,250.00");
    expect(
      within(purchaseDialog).getByRole("textbox", { name: "Shares" }),
    ).toHaveAccessibleDescription("Enter executed shares");

    unmount();

    render(
      await portfolioPage({
        amount: "1250.50",
        category: "aa-equity",
        trade: "sale",
      }),
      { wrapper: Toaster },
    );

    expect(
      screen.getByRole("tab", { hidden: true, name: "Transactions" }),
    ).toHaveAttribute("aria-selected", "true");
    const saleDialog = screen.getByRole("dialog", {
      name: "Sale · Global Equity Index",
    });
    expect(
      within(saleDialog).getByRole("combobox", { name: "Type" }),
    ).toHaveValue("sale");
    expect(
      within(saleDialog).getByRole("textbox", { name: "Net proceeds" }),
    ).toHaveValue("£1,250.50");
  });

  it("ignores unknown or array trade params and defensively omits invalid optional handoff params", async () => {
    vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
    vi.mocked(getOpened).mockResolvedValue(null);
    vi.mocked(getPortfolio).mockResolvedValue(ownedSample);

    const { unmount: unmountUnknown } = render(
      await portfolioPage({ amount: "500", trade: "dividend" }),
      { wrapper: Toaster },
    );
    expect(screen.getByRole("tab", { name: "Holdings" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    unmountUnknown();

    const { unmount: unmountArrayTrade } = render(
      await portfolioPage({ amount: "500", trade: ["purchase"] }),
      { wrapper: Toaster },
    );
    expect(screen.getByRole("tab", { name: "Holdings" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    unmountArrayTrade();

    const { unmount: unmountArrayOptional } = render(
      await portfolioPage({
        amount: ["500"],
        category: ["aa-equity"],
        portfolio: ["port-isa"],
        security: ["sec-world"],
        trade: "purchase",
      }),
      { wrapper: Toaster },
    );
    const arrayOptionalDialog = screen.getByRole("dialog", {
      name: "Purchase · Global Equity Index",
    });
    expect(
      within(arrayOptionalDialog).getByRole("textbox", { name: "Total paid" }),
    ).toHaveValue("");
    expect(
      within(arrayOptionalDialog).getByRole("textbox", { name: "Shares" }),
    ).toHaveAccessibleDescription("");
    unmountArrayOptional();

    for (const badAmount of ["0", "12.345", "abc", "1000000000001"]) {
      const { unmount } = render(
        await portfolioPage({
          amount: badAmount,
          category: "c".repeat(201),
          portfolio: "",
          security: "s".repeat(201),
          trade: "purchase",
        }),
        { wrapper: Toaster },
      );
      const dialog = screen.getByRole("dialog", {
        name: "Purchase · Global Equity Index",
      });
      expect(
        within(dialog).getByRole("textbox", { name: "Total paid" }),
      ).toHaveValue("");
      expect(
        within(dialog).getByRole("combobox", { name: "Security" }),
      ).toHaveValue("sec-world");
      unmount();
    }
  });

  it("stays on Transactions with the scenario caution and does not open the handoff dialog while a scenario is open", async () => {
    vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
    vi.mocked(getOpened).mockResolvedValue({
      isKept: true,
      name: "Retiring early",
    });
    vi.mocked(getPortfolio).mockResolvedValue(ownedSample);

    render(await portfolioPage({ amount: "500", trade: "purchase" }), {
      wrapper: Toaster,
    });

    expect(
      screen.getByText("Portfolio belongs to the household"),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Transactions" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(routerReplace).toHaveBeenCalledExactlyOnceWith(
      "/portfolio?tab=transactions",
      { scroll: false },
    );
  });
});
