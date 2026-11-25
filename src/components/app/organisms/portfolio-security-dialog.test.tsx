import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { NewPortfolioSecurity } from "@/data/portfolio";

import { addPortfolioSecurity } from "@/actions/portfolio";
import { Toaster } from "@/components/kit/toast";
import { refused, saved } from "@/lib/answer";
import { commit } from "@/test/dom";

import { PortfolioSecurityDialog } from "./portfolio-security-dialog";

vi.mock("@/actions/portfolio", () => ({ addPortfolioSecurity: vi.fn() }));

describe("PortfolioSecurityDialog", () => {
  it("saves trimmed security metadata and GBX pence quote dated to today", async () => {
    vi.mocked(addPortfolioSecurity).mockResolvedValue(
      saved({ id: "sec-new", savedOn: "2026-09-25", version: 2 }),
    );
    const onSaved = vi.fn<(draft: NewPortfolioSecurity) => void>();
    render(
      <PortfolioSecurityDialog
        categories={[
          { id: "aa-equity", name: "Global equity" },
          { id: "aa-bonds", name: "UK gilts" },
        ]}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        today="2026-09-25"
        version={1}
      />,
      { wrapper: Toaster },
    );

    expect(
      screen.getByRole("heading", { name: "Untitled security" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(
      screen
        .getAllByRole("paragraph")
        .map((paragraph) => paragraph.textContent),
    ).toContain(
      "Creates the security in the catalogue. Record a purchase or inbound delivery to add shares.",
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Security name" }), {
      target: { value: "  UK Gilts Fund  " },
    });
    expect(
      screen.getByRole("heading", { name: "UK Gilts Fund" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Currency" }), {
      target: { value: "GBX" },
    });

    const priceInput = screen.getByRole("textbox", {
      name: "Latest price (pence)",
    });
    expect(priceInput).toHaveAccessibleDescription(
      "Optional quote in pence, dated 25 Sep 2026",
    );
    // Live typing updates state without requiring a separate blur before Save.
    fireEvent.change(priceInput, { target: { value: "214.015" } });

    fireEvent.change(screen.getByRole("textbox", { name: "ISIN" }), {
      target: { value: "  GB00TEST0002  " },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Ticker" }), {
      target: { value: "  UKGF  " },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Asset class" }), {
      target: { value: "aa-bonds" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
      target: { value: "  Short duration  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Security saved" }),
      ).toHaveAccessibleDescription(
        "UK Gilts Fund (GBX) added to the catalogue",
      );
    });
    expect(addPortfolioSecurity).toHaveBeenCalledExactlyOnceWith(1, {
      categoryId: "aa-bonds",
      currency: "GBX",
      isin: "GB00TEST0002",
      latestPrice: 214.015,
      name: "UK Gilts Fund",
      note: "Short duration",
      ticker: "UKGF",
    });
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("allows clearing the optional price, handles stale category removal, and cancels cleanly", async () => {
    vi.mocked(addPortfolioSecurity)
      .mockResolvedValueOnce(
        refused("The portfolio file changed while this was being saved"),
      )
      .mockResolvedValueOnce(
        saved({ id: "sec-new", savedOn: "2026-09-25", version: 3 }),
      );
    const onSaved = vi.fn<(draft: NewPortfolioSecurity) => void>();
    const onDismiss = vi.fn<() => void>();
    const { rerender } = render(
      <PortfolioSecurityDialog
        categories={[{ id: "aa-bonds", name: "UK gilts" }]}
        onDismiss={onDismiss}
        onSaved={onSaved}
        today="2026-09-25"
        version={1}
      />,
      { wrapper: Toaster },
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Security name" }), {
      target: { value: "Global Bond Index" },
    });
    const priceInput = screen.getByRole("textbox", { name: "Latest price" });
    expect(priceInput).toHaveAccessibleDescription(
      "Optional quote dated 25 Sep 2026",
    );

    commit(priceInput, "98.5");
    commit(priceInput, "");
    const categorySelect = screen.getByRole("combobox", {
      name: "Asset class",
    });
    fireEvent.change(categorySelect, { target: { value: "aa-bonds" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Security not saved" }),
      ).toHaveAccessibleDescription(
        "The portfolio file changed while this was being saved",
      );
    });
    expect(onSaved).not.toHaveBeenCalled();

    // Refresh drops aa-bonds and advances version to 2; category clears to Unassigned ("").
    rerender(
      <PortfolioSecurityDialog
        categories={[]}
        onDismiss={onDismiss}
        onSaved={onSaved}
        today="2026-09-25"
        version={2}
      />,
    );
    expect(categorySelect).toHaveValue("");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledExactlyOnceWith({
        currency: "GBP",
        latestPrice: null,
        name: "Global Bond Index",
      });
    });
    expect(addPortfolioSecurity).toHaveBeenLastCalledWith(2, {
      currency: "GBP",
      latestPrice: null,
      name: "Global Bond Index",
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("normalizes a zero quote to null and defaults currency from defaultCurrency when supported", async () => {
    vi.mocked(addPortfolioSecurity).mockResolvedValue(
      saved({ id: "sec-zero", savedOn: "2026-09-25", version: 2 }),
    );
    const onSaved = vi.fn<(draft: NewPortfolioSecurity) => void>();
    const { rerender } = render(
      <PortfolioSecurityDialog
        categories={[]}
        defaultCurrency="USD"
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        today="2026-09-25"
        version={1}
      />,
      { wrapper: Toaster },
    );

    expect(screen.getByRole("combobox", { name: "Currency" })).toHaveValue(
      "USD",
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Security name" }), {
      target: { value: "Zero Quote ETF" },
    });
    commit(screen.getByRole("textbox", { name: "Latest price" }), "0");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledExactlyOnceWith({
        currency: "USD",
        latestPrice: null,
        name: "Zero Quote ETF",
      });
    });

    rerender(
      <PortfolioSecurityDialog
        categories={[]}
        defaultCurrency="CHF"
        key="fallback"
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        today="2026-09-25"
        version={1}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Currency" })).toHaveValue(
      "GBP",
    );
  });
});
