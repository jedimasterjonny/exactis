import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Targets } from "@/data/targets";
import type { Answer } from "@/lib/answer";

import { syncTargetsFromPortfolio } from "@/actions/targets";
import { Toaster } from "@/components/kit/toast";
import { targets } from "@/data/targets.fixture";
import { refused, saved } from "@/lib/answer";

import { PortfolioSync } from "./portfolio-sync";

vi.mock("@/actions/targets", () => ({ syncTargetsFromPortfolio: vi.fn() }));

describe("PortfolioSync", () => {
  it("renders an enabled outline button by default without aria-describedby", () => {
    render(<PortfolioSync branch={null} describedBy="sync-note" />);

    const button = screen.getByRole("button", { name: "Sync from Portfolio" });

    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-describedby");
    expect(button).toHaveClass("border-border");
  });

  it("syncs from Portfolio on the household branch, holds while busy, toasts the synced date, and restores focus to h1", async () => {
    const answer = Promise.withResolvers<Answer<Targets>>();
    vi.mocked(syncTargetsFromPortfolio).mockReturnValue(answer.promise);
    render(
      <>
        <h1 tabIndex={-1}>Plan assumptions</h1>
        <PortfolioSync branch={null} />
      </>,
      { wrapper: Toaster },
    );
    const button = screen.getByRole("button", { name: "Sync from Portfolio" });

    fireEvent.click(button);

    expect(syncTargetsFromPortfolio).toHaveBeenCalledExactlyOnceWith(null);
    await waitFor(() => {
      expect(button).toHaveAttribute("aria-busy", "true");
    });

    answer.resolve(saved({ ...targets, importedOn: "2026-09-25" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Target allocation synced" }),
      ).toHaveAccessibleDescription("From Portfolio, as at 25 Sep 2026");
    });
    await waitFor(() => {
      expect(button).not.toHaveAttribute("aria-busy");
    });
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
  });

  it("passes the scenario branch, succeeds cleanly without h1, and supports the default button variant", async () => {
    vi.mocked(syncTargetsFromPortfolio).mockResolvedValue(
      saved({ ...targets, importedOn: "2026-09-25" }),
    );
    render(<PortfolioSync branch="Retire early" variant="default" />, {
      wrapper: Toaster,
    });

    const button = screen.getByRole("button", { name: "Sync from Portfolio" });

    expect(button).toHaveClass("bg-primary");

    fireEvent.click(button);

    expect(syncTargetsFromPortfolio).toHaveBeenCalledExactlyOnceWith(
      "Retire early",
    );
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Target allocation synced" }),
      ).toHaveAccessibleDescription("From Portfolio, as at 25 Sep 2026");
    });
  });

  it("says why under a toast when the sync is refused", async () => {
    vi.mocked(syncTargetsFromPortfolio).mockResolvedValue(
      refused("Upload a portfolio file before syncing"),
    );
    render(<PortfolioSync branch={null} />, { wrapper: Toaster });

    fireEvent.click(
      screen.getByRole("button", { name: "Sync from Portfolio" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Allocation not synced" }),
      ).toHaveAccessibleDescription("Upload a portfolio file before syncing");
    });
  });

  it("disables the button and links aria-describedby when disabled", () => {
    render(
      <>
        <p id="sync-blocker">Switch to custom rates first.</p>
        <PortfolioSync branch={null} describedBy="sync-blocker" isDisabled />
      </>,
    );

    const button = screen.getByRole("button", { name: "Sync from Portfolio" });

    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("Switch to custom rates first.");
  });
});
