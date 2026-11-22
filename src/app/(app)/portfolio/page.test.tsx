import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Toaster } from "@/components/kit/toast";
import { samplePortfolioFile } from "@/lib/portfolio-file.fixture";
import { getOpened } from "@/store/household";

import Portfolio, { metadata } from "./page";

vi.mock("@/store/household", () => ({ getOpened: vi.fn() }));

describe("Portfolio", () => {
  it("titles the page by its label in the navigation", () => {
    expect(metadata).toStrictEqual({ title: "Portfolio" });
  });

  it("renders the portfolio screen unlocked when the household is open", async () => {
    vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
    vi.mocked(getOpened).mockResolvedValue(null);

    render(await Portfolio(), { wrapper: Toaster });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Portfolio",
    );
    expect(screen.getByText("Sect. IX · Portfolio")).toHaveClass("label");
    expect(screen.getByText("No portfolio file open")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Portfolio Performance file"), {
      target: {
        files: [new File([samplePortfolioFile()], "northstar.portfolio")],
      },
    });

    expect(
      await screen.findByText("northstar.portfolio · GBP"),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("definition")
        .map((definition) => definition.textContent),
    ).toContain("22 Sep 2026 · 3 days old");
    expect(
      screen.getByRole("button", { name: "Add securities account" }),
    ).toBeEnabled();
  });

  it("locks preview additions when a scenario is open", async () => {
    vi.setSystemTime(new Date("2026-09-25T12:00:00Z"));
    vi.mocked(getOpened).mockResolvedValue({
      isKept: true,
      name: "Retiring early",
    });

    render(await Portfolio(), { wrapper: Toaster });

    fireEvent.change(screen.getByLabelText("Portfolio Performance file"), {
      target: {
        files: [new File([samplePortfolioFile()], "northstar.portfolio")],
      },
    });

    expect(
      await screen.findByText("Portfolio belongs to the household"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add securities account" }),
    ).toBeDisabled();
  });
});
