import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Toaster } from "@/components/kit/toast";
import {
  portfolioFile,
  samplePortfolioFile,
} from "@/lib/portfolio-file.fixture";

import { PortfolioScreen } from "./portfolio-screen";

const gbpFile = samplePortfolioFile("GBP");
const usdFile = samplePortfolioFile("USD");

function openPortfolio(bytes: Uint8Array<ArrayBuffer>, name: string): void {
  fireEvent.change(screen.getByLabelText("Portfolio Performance file"), {
    target: { files: [new File([bytes], name)] },
  });
}

describe("PortfolioScreen", () => {
  it("opens on the empty state, reads a chosen file, and renders the headline, summary strip, and paired accounts", async () => {
    render(<PortfolioScreen isInScenario={false} today="2026-09-25" />, {
      wrapper: Toaster,
    });

    expect(screen.getByText("Sect. IX · Portfolio")).toHaveClass("label");
    expect(screen.getByText("No file open")).toBeInTheDocument();
    expect(screen.getByText("No portfolio file open")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The file is read in your browser and never leaves this device.",
      ),
    ).toBeInTheDocument();

    openPortfolio(gbpFile, "northstar.portfolio");

    expect(
      await screen.findByText("northstar.portfolio · GBP"),
    ).toBeInTheDocument();
    expect(screen.getByText("View only")).toHaveAttribute(
      "data-variant",
      "caution",
    );
    expect(
      screen.getByRole("heading", { level: 2, name: /^The portfolio holds/ }),
    ).toHaveTextContent(
      "The portfolio holds £2,500 across 1 securities account and 2 cash accounts, with £1,250 uninvested.",
    );
    expect(
      screen
        .getAllByRole("definition")
        .map((definition) => definition.textContent),
    ).toContain("22 Sep 2026 · 3 days old");
    expect(screen.getByText("Northstar ISA")).toBeInTheDocument();
    expect(screen.getByText("Reserve Cash")).toBeInTheDocument();
    expect(
      screen.queryByText("Portfolio belongs to the household"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^Base currency is/)).not.toBeInTheDocument();
  });

  it("supports adding preview securities and cash accounts, dismissing the dialog, clearing preview, and switching files", async () => {
    render(<PortfolioScreen isInScenario={false} today="2026-09-25" />, {
      wrapper: Toaster,
    });

    openPortfolio(gbpFile, "northstar.portfolio");
    await screen.findByText("Northstar ISA");

    // Open and dismiss first.
    fireEvent.click(
      screen.getByRole("button", { name: "Add securities account" }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Add a preview securities account linked to Reserve Cash with a note.
    fireEvent.click(
      screen.getByRole("button", { name: "Add securities account" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Harbour GIA" },
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Reference cash account" }),
      { target: { value: "cash-reserve" } },
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
      target: { value: "Draft dealing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));

    expect(await screen.findByText("Harbour GIA")).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Account added to preview" }),
    ).toHaveAccessibleDescription(
      "Shown in this view only. Changes are not saved to the file yet.",
    );
    expect(
      screen.getByText("Preview entries are kept in this browser tab only"),
    ).toBeInTheDocument();

    // Add an unlinked preview securities account without optional fields.
    fireEvent.click(
      screen.getByRole("button", { name: "Add securities account" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Direct Certs" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));
    expect(await screen.findByText("Direct Certs")).toBeInTheDocument();

    // Add a preview cash account with a note, then another without a note.
    fireEvent.click(screen.getByRole("button", { name: "Add cash account" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Dollar Reserve" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Currency" }), {
      target: { value: "USD" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), {
      target: { value: "FX pot" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));

    expect(await screen.findByText("Dollar Reserve")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add cash account" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Euro Float" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));
    expect(await screen.findByText("Euro Float")).toBeInTheDocument();

    // Preview accounts do not alter the real-file headline or summary KPIs,
    // while newly previewed cash accounts are selectable as reference accounts.
    expect(
      screen.getByRole("heading", { level: 2, name: /^The portfolio holds/ }),
    ).toHaveTextContent(
      "The portfolio holds £2,500 across 1 securities account and 2 cash accounts, with £1,250 uninvested.",
    );
    expect(
      screen
        .getAllByRole("definition")
        .map((definition) => definition.textContent),
    ).toContain("1 securities · 2 cash");

    fireEvent.click(
      screen.getByRole("button", { name: "Add securities account" }),
    );
    expect(
      screen.getByRole("option", { name: "Dollar Reserve (USD)" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    // Clear preview drops every draft account and removes the caution banner.
    fireEvent.click(screen.getByRole("button", { name: "Clear preview" }));
    expect(screen.queryByText("Harbour GIA")).not.toBeInTheDocument();
    expect(screen.queryByText("Dollar Reserve")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Preview entries are kept in this browser tab only"),
    ).not.toBeInTheDocument();

    // Add one draft again, then switch to a USD-base file to verify both draft reset and non-GBP caution.
    fireEvent.click(screen.getByRole("button", { name: "Add cash account" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Temporary Cash" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add preview" }));
    expect(await screen.findByText("Temporary Cash")).toBeInTheDocument();

    openPortfolio(usdFile, "dollar.portfolio");

    expect(
      await screen.findByText("dollar.portfolio · USD"),
    ).toBeInTheDocument();
    expect(screen.getByText("Base currency is USD")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Totals below are shown in GBP where an exchange rate is known.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Temporary Cash")).not.toBeInTheDocument();
  });

  it("shows the scenario caution and describes disabled add buttons with it when a scenario is open", async () => {
    render(<PortfolioScreen isInScenario today="2026-09-25" />, {
      wrapper: Toaster,
    });

    openPortfolio(gbpFile, "northstar.portfolio");

    expect(
      await screen.findByText("Portfolio belongs to the household"),
    ).toBeInTheDocument();

    const addSecurities = screen.getByRole("button", {
      name: "Add securities account",
    });
    const addCash = screen.getByRole("button", { name: "Add cash account" });

    expect(addSecurities).toBeDisabled();
    expect(addCash).toBeDisabled();
    expect(addSecurities).toHaveAccessibleDescription(
      "Portfolio belongs to the household Leave the scenario to add preview entries.",
    );
    expect(addCash).toHaveAccessibleDescription(
      "Portfolio belongs to the household Leave the scenario to add preview entries.",
    );
  });

  it("resets Show retired accounts when switching to another file", async () => {
    const fileWithRetired = portfolioFile([
      [
        3,
        [
          [1, "cash-old"],
          [2, "Closed Cash"],
          [3, "GBP"],
          [5, 1],
        ],
      ],
      [12, "GBP"],
    ]);

    render(<PortfolioScreen isInScenario={false} today="2026-09-25" />, {
      wrapper: Toaster,
    });

    openPortfolio(fileWithRetired, "first.portfolio");
    const toggle = await screen.findByRole("switch", {
      name: "Show retired accounts",
    });
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();

    openPortfolio(fileWithRetired, "second.portfolio");
    expect(
      await screen.findByText("second.portfolio · GBP"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Show retired accounts" }),
    ).not.toBeChecked();
  });
});
