// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";

import { balancesSheet } from "./balances-sheet";

// An account as the sheet reads it, growing at the plan's rate.
function account(
  values: Pick<Account, "balance" | "id" | "kind" | "name" | "secures">,
): Account {
  return { ...values, growth: { kind: "plan" } };
}

// An invented household holding the accounts the owner's sheet has
// columns for, listed as the accounts screen might list them rather than
// as the sheet does: the pensions first and each car's loan beside it.
const accounts = [
  account({ balance: 170_000, id: 8, kind: "tax-deferred", name: "SIPP" }),
  account({
    balance: 85_000,
    id: 9,
    kind: "tax-deferred",
    name: "Work pension",
  }),
  account({
    balance: 2600,
    id: 10,
    kind: "tax-deferred",
    name: "Alex pension",
  }),
  account({ balance: 100_000, id: 5, kind: "tax-free", name: "Sam ISA" }),
  account({ balance: 4500, id: 6, kind: "tax-free", name: "Alex ISA" }),
  account({ balance: 550, id: 7, kind: "taxable", name: "GIA" }),
  account({ balance: 9000, id: 1, kind: "cash", name: "Joint" }),
  account({ balance: 1500, id: 2, kind: "cash", name: "Sam" }),
  account({ balance: 120, id: 3, kind: "cash", name: "Alex" }),
  account({ balance: -1250, id: 4, kind: "debt", name: "Credit cards" }),
  account({ balance: 415_000, id: 11, kind: "house", name: "House" }),
  account({
    balance: -340_000,
    id: 12,
    kind: "debt",
    name: "Mortgage",
    secures: 11,
  }),
  account({ balance: 72_000, id: 13, kind: "car", name: "Sam car" }),
  account({
    balance: -60_000,
    id: 15,
    kind: "debt",
    name: "Sam car loan",
    secures: 13,
  }),
  account({ balance: 14_000, id: 14, kind: "car", name: "Alex car" }),
  account({
    balance: -10_000,
    id: 16,
    kind: "debt",
    name: "Alex car loan",
    secures: 14,
  }),
];

describe("balancesSheet", () => {
  it("lays the balances out as a row of the owner's sheet, each group summed, then the total and a point's five", () => {
    expect(balancesSheet(accounts, "2026-09-25").split("\r\n")).toStrictEqual([
      "Date,,Joint,Sam,Alex,Credit cards,Cash,,Sam ISA,Alex ISA,GIA,Investments,,SIPP,Work pension,Alex pension,Pension,,House,Mortgage,House Equity,,Sam car,Alex car,Sam car loan,Alex car loan,Car Equity,,Total,,Deferred,Free,Assets,Loans,UnSec",
      [
        "25/09/2026,",
        '"£9,000.00","£1,500.00",£120.00,"-£1,250.00","£9,370.00",',
        '"£100,000.00","£4,500.00",£550.00,"£105,050.00",',
        '"£170,000.00","£85,000.00","£2,600.00","£257,600.00",',
        '"£415,000.00","-£340,000.00","£75,000.00",',
        '"£72,000.00","£14,000.00","-£60,000.00","-£10,000.00","£16,000.00",',
        '"£463,020.00",',
        '"£257,600","£104,500","£501,000","-£410,000","-£1,250"',
      ].join(","),
      "",
    ]);
  });

  it("lists a real asset, and the loan on it, with the cars", () => {
    expect(
      balancesSheet(
        [
          account({
            balance: -3000,
            id: 2,
            kind: "debt",
            name: "Boat loan",
            secures: 1,
          }),
          account({ balance: 5000, id: 1, kind: "real-asset", name: "Boat" }),
        ],
        "2026-09-25",
      ).split("\r\n"),
    ).toStrictEqual([
      "Date,,Cash,,Investments,,Pension,,House Equity,,Boat,Boat loan,Car Equity,,Total,,Deferred,Free,Assets,Loans,UnSec",
      '25/09/2026,,£0.00,,£0.00,,£0.00,,£0.00,,"£5,000.00","-£3,000.00","£2,000.00",,"£2,000.00",,£0,£0,"£5,000","-£3,000",£0',
      "",
    ]);
  });

  it("quotes a name holding a comma or a quote, doubling the quote, and nothing else", () => {
    const [heading] = balancesSheet(
      [
        account({ balance: 0, id: 1, kind: "cash", name: "Sam, joint" }),
        account({
          balance: 0,
          id: 2,
          kind: "cash",
          name: 'The "rainy day" pot',
        }),
        account({ balance: 0, id: 3, kind: "cash", name: "Alex's" }),
      ],
      "2026-09-25",
    ).split("\r\n");

    expect(heading).toBe(
      `Date,,"Sam, joint","The ""rainy day"" pot",Alex's,Cash,,Investments,,Pension,,House Equity,,Car Equity,,Total,,Deferred,Free,Assets,Loans,UnSec`,
    );
  });

  it("lays out a household with no accounts as the sums' headings and a row of nothings", () => {
    expect(balancesSheet([], "2026-01-02")).toBe(
      "Date,,Cash,,Investments,,Pension,,House Equity,,Car Equity,,Total,,Deferred,Free,Assets,Loans,UnSec\r\n" +
        "02/01/2026,,£0.00,,£0.00,,£0.00,,£0.00,,£0.00,,£0.00,,£0,£0,£0,£0,£0\r\n",
    );
  });
});
