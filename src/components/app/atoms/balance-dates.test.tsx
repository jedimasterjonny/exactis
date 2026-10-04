import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";

import { accounts } from "@/data/accounts.fixture";

import { BalanceDates } from "./balance-dates";

const [pension, isa, cash, home, mortgage] = accounts;

// What the strip says of each group on the fourth of October, as the
// group's name and what it says, in the order the strip gives them.
function groupsOn(held: readonly Account[]): (null | string)[][] {
  render(<BalanceDates accounts={held} today="2026-10-04" />);
  const values = screen.getAllByRole("definition");
  return screen
    .getAllByRole("term")
    .map((term, place) => [
      term.textContent,
      values[place]?.textContent ?? null,
    ]);
}

describe("BalanceDates", () => {
  // The savings were set on two days, so the strip gives the older; the
  // home was set on one, and the mortgage today.
  it("says the day each group's balances were set and how old that is, the oldest where they differ", () => {
    expect(
      groupsOn([
        { ...pension, setOn: "2026-10-03" },
        { ...isa, setOn: "2026-09-01" },
        { ...cash, setOn: "2026-10-03" },
        { ...home, setOn: "2026-03-14" },
        { ...mortgage, setOn: "2026-10-04" },
      ]),
    ).toStrictEqual([
      ["Savings", "Oldest set 1 Sep 2026 · 33 days old"],
      ["Property & vehicles", "Set 14 Mar 2026 · 204 days old"],
      ["Loans & debts", "Set 4 Oct 2026 · today"],
    ]);
  });

  // A balance kept before the day was is older than any day it could be
  // given, so its group is not dated however fresh the rest are.
  it("says a group with any balance never dated is not dated, and a group of none holds none", () => {
    expect(
      groupsOn([{ ...pension, setOn: "2026-10-03" }, isa, cash]),
    ).toStrictEqual([
      ["Savings", "Not dated"],
      ["Property & vehicles", "None held"],
      ["Loans & debts", "None held"],
    ]);
  });
});
