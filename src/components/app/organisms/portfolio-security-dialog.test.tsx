import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { commit } from "@/test/dom";

import type { NewPortfolioSecurity } from "./portfolio-security-dialog";

import { PortfolioSecurityDialog } from "./portfolio-security-dialog";

describe("PortfolioSecurityDialog", () => {
  it("submits trimmed security metadata and GBX pence quote safely", () => {
    const onAdd = vi.fn<(draft: NewPortfolioSecurity) => void>();
    render(
      <PortfolioSecurityDialog
        categories={[
          { id: "aa-equity", name: "Global equity" },
          { id: "aa-bonds", name: "UK gilts" },
        ]}
        onAdd={onAdd}
        onDismiss={vi.fn<() => void>()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Untitled security" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add preview" })).toBeDisabled();

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
    expect(priceInput).toHaveAccessibleDescription("Optional quote in pence");
    commit(priceInput, "214.015");
    expect(priceInput).toHaveValue("214.015");

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
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));

    expect(onAdd).toHaveBeenCalledWith({
      categoryId: "aa-bonds",
      currency: "GBX",
      isin: "GB00TEST0002",
      latestPrice: 214.015,
      name: "UK Gilts Fund",
      note: "Short duration",
      ticker: "UKGF",
    });
  });

  it("allows clearing the optional price and submits minimal fields or cancels cleanly", () => {
    const onAdd = vi.fn<(draft: NewPortfolioSecurity) => void>();
    const onDismiss = vi.fn<() => void>();
    render(
      <PortfolioSecurityDialog
        categories={[]}
        onAdd={onAdd}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Security name" }), {
      target: { value: "Global Bond Index" },
    });
    const priceInput = screen.getByRole("textbox", { name: "Latest price" });
    expect(priceInput).toHaveAccessibleDescription("Optional latest quote");

    commit(priceInput, "98.5");
    commit(priceInput, "");
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));

    expect(onAdd).toHaveBeenCalledWith({
      currency: "GBP",
      latestPrice: null,
      name: "Global Bond Index",
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("normalizes a zero quote to null and defaults currency from defaultCurrency when supported", () => {
    const onAdd = vi.fn<(draft: NewPortfolioSecurity) => void>();
    const { rerender } = render(
      <PortfolioSecurityDialog
        categories={[]}
        defaultCurrency="USD"
        onAdd={onAdd}
        onDismiss={vi.fn<() => void>()}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Currency" })).toHaveValue(
      "USD",
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Security name" }), {
      target: { value: "Zero Quote ETF" },
    });
    commit(screen.getByRole("textbox", { name: "Latest price" }), "0");
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));

    expect(onAdd).toHaveBeenCalledWith({
      currency: "USD",
      latestPrice: null,
      name: "Zero Quote ETF",
    });

    rerender(
      <PortfolioSecurityDialog
        categories={[]}
        defaultCurrency="CHF"
        key="fallback"
        onAdd={onAdd}
        onDismiss={vi.fn<() => void>()}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Currency" })).toHaveValue(
      "GBP",
    );
  });
});
