import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Holding } from "@/data/portfolio";

import {
  addPortfolioSecurity,
  editPortfolioSecurity,
} from "@/actions/portfolio";
import { Toaster } from "@/components/kit/toast";
import { refused, saved } from "@/lib/answer";
import { commit } from "@/test/dom";

import { PortfolioSecurityDialog } from "./portfolio-security-dialog";

vi.mock("@/actions/portfolio", () => ({
  addPortfolioSecurity: vi.fn(),
  editPortfolioSecurity: vi.fn(),
}));

describe("PortfolioSecurityDialog", () => {
  it("saves trimmed security metadata and GBX pence quote dated to today", async () => {
    vi.mocked(addPortfolioSecurity).mockResolvedValue(
      saved({ id: "sec-new", savedOn: "2026-09-25", version: 2 }),
    );
    const onSaved =
      vi.fn<
        (outcome: {
          readonly isRetired: boolean;
          readonly version: number;
        }) => void
      >();
    render(
      <PortfolioSecurityDialog
        categories={[
          { id: "aa-equity", name: "Global equity", securityIds: [] },
          { id: "aa-bonds", name: "UK gilts", securityIds: [] },
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
    const onSaved =
      vi.fn<
        (outcome: {
          readonly isRetired: boolean;
          readonly version: number;
        }) => void
      >();
    const onDismiss = vi.fn<() => void>();
    const { rerender } = render(
      <PortfolioSecurityDialog
        categories={[{ id: "aa-bonds", name: "UK gilts", securityIds: [] }]}
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
        isRetired: false,
        version: 3,
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
    const onSaved =
      vi.fn<
        (outcome: {
          readonly isRetired: boolean;
          readonly version: number;
        }) => void
      >();
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
        isRetired: false,
        version: 2,
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

  it("appends syncWarning to the success toast and still completes onSaved", async () => {
    vi.mocked(addPortfolioSecurity).mockResolvedValue(
      saved({
        id: "sec-warn",
        savedOn: "2026-09-25",
        syncWarning: "The household target allocation could not be synced yet",
        version: 2,
      }),
    );
    const onSaved =
      vi.fn<
        (outcome: {
          readonly isRetired: boolean;
          readonly version: number;
        }) => void
      >();
    render(
      <PortfolioSecurityDialog
        categories={[]}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        today="2026-09-25"
        version={1}
      />,
      { wrapper: Toaster },
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Security name" }), {
      target: { value: "Sterling Index" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Security saved" }),
      ).toHaveAccessibleDescription(
        "Sterling Index (GBP) added to the catalogue. Targets not synced: The household target allocation could not be synced yet",
      );
    });
    expect(onSaved).toHaveBeenCalledExactlyOnceWith({
      isRetired: false,
      version: 2,
    });
  });

  it("edits securities with locked currency and split category, offers Delete when unused, shows transaction lock note, and tailors retire/restore toasts", async () => {
    vi.mocked(editPortfolioSecurity)
      .mockResolvedValueOnce(
        saved({ id: "sec-1", savedOn: "2026-09-25", version: 2 }),
      )
      .mockResolvedValueOnce(
        saved({ id: "sec-1", savedOn: "2026-09-25", version: 3 }),
      )
      .mockResolvedValueOnce(
        saved({ id: "sec-split", savedOn: "2026-09-25", version: 4 }),
      );

    const editableSec: Holding = {
      category: "Global equity",
      categoryId: "aa-equity",
      currency: "JPY",
      gbpRate: null,
      id: "sec-1",
      isin: "JP00TEST0001",
      isRetired: false,
      isSplitCategory: false,
      latestPrice: 1000,
      latestPriceDate: "2026-09-25",
      name: "Tokyo Tracker",
      note: "Core Asia",
      shares: 0,
      sharesByAccount: [],
      ticker: "TOKY",
      transactionCount: 0,
    };
    const splitSec: Holding = {
      currency: "",
      gbpRate: null,
      id: "sec-split",
      isRetired: false,
      isSplitCategory: true,
      latestPrice: null,
      latestPriceDate: null,
      name: "Multi Asset Trust",
      shares: 2,
      sharesByAccount: [{ portfolioId: "port-isa", shares: 2 }],
      transactionCount: 2,
    };

    const onDelete = vi.fn<() => void>();
    const onSaved =
      vi.fn<
        (outcome: {
          readonly isRetired: boolean;
          readonly version: number;
        }) => void
      >();

    const { rerender } = render(
      <PortfolioSecurityDialog
        categories={[
          { id: "aa-equity", name: "Global equity", securityIds: [] },
          { id: "aa-bonds", name: "UK gilts", securityIds: [] },
        ]}
        onDelete={onDelete}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        security={editableSec}
        today="2026-09-25"
        version={1}
      />,
      { wrapper: Toaster },
    );

    expect(screen.getByRole("combobox", { name: "Currency" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Currency" })).toHaveValue(
      "JPY",
    );
    expect(
      screen.queryByRole("textbox", { name: /Latest price/u }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledOnce();

    fireEvent.change(screen.getByRole("combobox", { name: "Asset class" }), {
      target: { value: "aa-bonds" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "Retired" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Security retired" }),
      ).toHaveAccessibleDescription("Tokyo Tracker marked as retired");
    });
    expect(editPortfolioSecurity).toHaveBeenCalledWith(1, {
      categoryId: "aa-bonds",
      id: "sec-1",
      isin: "JP00TEST0001",
      isRetired: true,
      name: "Tokyo Tracker",
      note: "Core Asia",
      ticker: "TOKY",
    });

    // Restoring retired security triggers "Security restored" toast.
    rerender(
      <PortfolioSecurityDialog
        categories={[{ id: "aa-bonds", name: "UK gilts", securityIds: [] }]}
        key="restore"
        onDelete={onDelete}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        security={{ ...editableSec, isRetired: true }}
        today="2026-09-25"
        version={2}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: "Retired" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Security restored" }),
      ).toHaveAccessibleDescription(
        "Tokyo Tracker restored to active securities",
      );
    });

    // Split security locks Asset class, omits categoryId, shows blank currency as None, and shows transaction lock note.
    rerender(
      <PortfolioSecurityDialog
        categories={[{ id: "aa-bonds", name: "UK gilts", securityIds: [] }]}
        key="split"
        onDelete={onDelete}
        onDismiss={vi.fn<() => void>()}
        onSaved={onSaved}
        security={splitSec}
        today="2026-09-25"
        version={3}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: "Asset class" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("option", { name: "Split allocation" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "None" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole("paragraph")
        .map((paragraph) => paragraph.textContent),
    ).toContain("Used by 2 transactions — retire it instead");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Security saved" }),
      ).toHaveAccessibleDescription("Multi Asset Trust updated");
    });
    expect(editPortfolioSecurity).toHaveBeenLastCalledWith(3, {
      id: "sec-split",
      isRetired: false,
      name: "Multi Asset Trust",
    });
  });
});
