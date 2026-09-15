import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Toaster } from "@/components/ui/toast";
import { accounts, isAsset } from "@/data/accounts";

import { AccountLedger } from "./account-ledger";

const held = accounts.filter((account) => !isAsset(account));
const assets = accounts.filter(isAsset);

function commit(field: HTMLElement, value: string): void {
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

function openEntry(): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: "Add account" }));
  return screen.getByRole("dialog");
}

// Save reports through the toast manager, which needs its Toaster mounted.
function renderLedger(): void {
  render(
    <Toaster>
      <AccountLedger accounts={accounts} />
    </Toaster>,
  );
}

function rowsOf(panel: HTMLElement): HTMLElement[] {
  const [, ...rows] = within(panel).getAllByRole("row");
  return rows;
}

describe("AccountLedger", () => {
  it("opens with the header, its counts and its action", () => {
    renderLedger();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Accounts & assets",
    );
    expect(screen.getByText("Sect. II · Accounts & assets")).toHaveClass(
      "label",
    );
    expect(screen.getByText("3 accounts · 2 assets")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens on the accounts tab and switches to the assets tab", () => {
    renderLedger();

    const accountsTab = screen.getByRole("tab", { name: /^Accounts/ });
    const assetsTab = screen.getByRole("tab", { name: /^Assets/ });

    expect(accountsTab).toHaveAttribute("aria-selected", "true");
    expect(within(accountsTab).getByText("3")).toHaveClass("label");
    expect(within(assetsTab).getByText("2")).toHaveClass("label");

    let panel = screen.getByRole("tabpanel");

    expect(rowsOf(panel)).toHaveLength(held.length);
    expect(within(panel).getByRole("paragraph")).toHaveTextContent(
      "Allocation is set once at plan level",
    );

    fireEvent.click(assetsTab);

    panel = screen.getByRole("tabpanel");

    expect(assetsTab).toHaveAttribute("aria-selected", "true");
    expect(rowsOf(panel)).toHaveLength(assets.length);
    expect(within(panel).getByRole("paragraph")).toHaveTextContent(
      "A loan is listed against the asset it secures.",
    );

    fireEvent.click(accountsTab);

    expect(accountsTab).toHaveAttribute("aria-selected", "true");
  });

  it("adds a named account to the accounts tab and reports it", () => {
    renderLedger();

    const dialog = openEntry();

    expect(within(dialog).getByText("New account")).toHaveClass("text-brand");
    expect(
      within(dialog).getByRole("heading", { name: "Untitled account" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(
      within(dialog).queryByRole("textbox", { name: "Rate" }),
    ).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: " Lifetime ISA " },
    });
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Treatment" }),
      { target: { value: "tax-free" } },
    );
    commit(within(dialog).getByRole("textbox", { name: "Balance" }), "4,000");
    commit(
      within(dialog).getByRole("textbox", { name: "Contribution" }),
      "333",
    );
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Cadence" }),
      { target: { value: "month" } },
    );
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Growth" }), {
      target: { value: "fixed" },
    });
    commit(within(dialog).getByRole("textbox", { name: "Rate" }), "3");

    expect(
      within(dialog).getByRole("heading", { name: "Lifetime ISA" }),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(
      screen.queryByRole("dialog", { name: "Lifetime ISA" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Account added" }),
    ).toHaveAccessibleDescription("Lifetime ISA");
    expect(screen.getByText("4 accounts · 2 assets")).toBeInTheDocument();

    const panel = screen.getByRole("tabpanel");
    const [, , , added] = rowsOf(panel);

    expect(rowsOf(panel)).toHaveLength(held.length + 1);
    expect(added).toBeDefined();
    expect(within(added ?? panel).getByText("Tax-free")).toBeInTheDocument();
    expect(
      within(panel).getByRole("cell", { name: "£4,000" }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole("cell", { name: "£333 / mo" }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole("cell", { name: "3.00%" }),
    ).toBeInTheDocument();
  });

  it("adds a real asset to the assets tab and brings that tab forward", () => {
    renderLedger();

    const dialog = openEntry();

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "Car" },
    });
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Treatment" }),
      { target: { value: "real-asset" } },
    );
    commit(within(dialog).getByRole("textbox", { name: "Balance" }), "12,500");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(screen.getByRole("tab", { name: /^Assets/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("3 accounts · 3 assets")).toBeInTheDocument();

    const panel = screen.getByRole("tabpanel");

    expect(rowsOf(panel)).toHaveLength(assets.length + 1);
    expect(
      within(panel).getByRole("cell", { name: "Car" }),
    ).toBeInTheDocument();
    expect(within(panel).getAllByRole("cell", { name: "—" })).toHaveLength(2);
    expect(
      within(panel).getAllByRole("cell", { name: "Plan rate" }),
    ).toHaveLength(1);
  });

  it("drops a cancelled draft and leaves a cleared figure as it was", () => {
    renderLedger();

    let dialog = openEntry();

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "Premium bonds" },
    });
    commit(within(dialog).getByRole("textbox", { name: "Balance" }), "");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    dialog = openEntry();

    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "",
    );
    expect(
      within(dialog).getByRole("textbox", { name: "Balance" }),
    ).toHaveValue("£0");
    expect(screen.getByText("3 accounts · 2 assets")).toBeInTheDocument();
  });
});
