import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { accounts } from "@/data/accounts.fixture";

import Accounts from "./page";
import { getAccounts } from "./store";

vi.mock("./store", () => ({ getAccounts: vi.fn() }));
vi.mock("./actions", () => ({ saveAccount: vi.fn() }));

describe("Accounts", () => {
  it("hands the store's accounts to the ledger", async () => {
    vi.mocked(getAccounts).mockResolvedValue([...accounts]);

    render(await Accounts());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Accounts & assets",
    );
    expect(screen.getByText("3 accounts · 2 assets")).toBeInTheDocument();
  });
});
