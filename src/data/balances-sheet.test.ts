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
  account({ balance: 143_500, id: 8, kind: "tax-deferred", name: "SIPP" }),
  account({
    balance: 61_200,
    id: 9,
    kind: "tax-deferred",
    name: "Work pension",
  }),
  account({
    balance: 3900,
    id: 10,
    kind: "tax-deferred",
    name: "Alex pension",
  }),
  account({ balance: 76_400, id: 5, kind: "tax-free", name: "Sam ISA" }),
  account({ balance: 6800, id: 6, kind: "tax-free", name: "Alex ISA" }),
  account({ balance: 1240, id: 7, kind: "taxable", name: "GIA" }),
  account({ balance: 7300, id: 1, kind: "cash", name: "Joint" }),
  account({ balance: 2150, id: 2, kind: "cash", name: "Sam" }),
  account({ balance: 340, id: 3, kind: "cash", name: "Alex" }),
  account({ balance: -980, id: 4, kind: "debt", name: "Credit cards" }),
  account({ balance: 398_000, id: 11, kind: "house", name: "House" }),
  account({
    balance: -333_000,
    id: 12,
    kind: "debt",
    name: "Mortgage",
    secures: 11,
  }),
  account({ balance: 41_000, id: 13, kind: "car", name: "Sam car" }),
  account({
    balance: -33_500,
    id: 15,
    kind: "debt",
    name: "Sam car loan",
    secures: 13,
  }),
  account({ balance: 8500, id: 14, kind: "car", name: "Alex car" }),
  account({
    balance: -6000,
    id: 16,
    kind: "debt",
    name: "Alex car loan",
    secures: 14,
  }),
];

describe("balancesSheet", () => {
  it("lays the balances out as a row of the owner's sheet, each group summed, then the total and a point's five", () => {
    expect(balancesSheet(accounts, "2026-09-18").split("\r\n")).toStrictEqual([
      "Date,,Joint,Sam,Alex,Credit cards,Cash,,Sam ISA,Alex ISA,GIA,Investments,,SIPP,Work pension,Alex pension,Pension,,House,Mortgage,House Equity,,Sam car,Alex car,Sam car loan,Alex car loan,Car Equity,,Total,,Deferred,Free,Assets,Loans,UnSec",
      [
        "18/09/2026,",
        '"£7,300.00","£2,150.00",£340.00,-£980.00,"£8,810.00",',
        '"£76,400.00","£6,800.00","£1,240.00","£84,440.00",',
        '"£143,500.00","£61,200.00","£3,900.00","£208,600.00",',
        '"£398,000.00","-£333,000.00","£65,000.00",',
        '"£41,000.00","£8,500.00","-£33,500.00","-£6,000.00","£10,000.00",',
        '"£376,850.00",',
        '"£208,600","£83,200","£447,500","-£372,500",-£980',
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
        "2026-09-18",
      ).split("\r\n"),
    ).toStrictEqual([
      "Date,,Cash,,Investments,,Pension,,House Equity,,Boat,Boat loan,Car Equity,,Total,,Deferred,Free,Assets,Loans,UnSec",
      '18/09/2026,,£0.00,,£0.00,,£0.00,,£0.00,,"£5,000.00","-£3,000.00","£2,000.00",,"£2,000.00",,£0,£0,"£5,000","-£3,000",£0',
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
      "2026-09-18",
    ).split("\r\n");

    expect(heading).toBe(
      `Date,,"Sam, joint","The ""rainy day"" pot",Alex's,Cash,,Investments,,Pension,,House Equity,,Car Equity,,Total,,Deferred,Free,Assets,Loans,UnSec`,
    );
  });

  // Pasted into a sheet, a name opening with =, +, - or @ is a formula,
  // and one opening with a tab or a carriage return can start one past
  // it; the apostrophe makes each text. The figures beneath keep their
  // hyphens, since a negative balance is to paste as a number.
  it("writes a name a spreadsheet would read as a formula after an apostrophe, and leaves the figures as they are", () => {
    const names = [
      '=HYPERLINK("https://example.com","Joint")',
      "+44 saver",
      "-Overdraft",
      "@SUM",
      "\tTabbed",
      "\rReturned",
    ];
    const [heading, row] = balancesSheet(
      names.map((name, index) =>
        account({ balance: -1000, id: index + 1, kind: "debt", name }),
      ),
      "2026-09-18",
    ).split("\r\n");

    expect(heading).toBe(
      `Date,,"'=HYPERLINK(""https://example.com"",""Joint"")",'+44 saver,'-Overdraft,'@SUM,'\tTabbed,"'\rReturned",Cash,,Investments,,Pension,,House Equity,,Car Equity,,Total,,Deferred,Free,Assets,Loans,UnSec`,
    );
    expect(row).toBe(
      '18/09/2026,,"-£1,000.00","-£1,000.00","-£1,000.00","-£1,000.00","-£1,000.00","-£1,000.00","-£6,000.00",,£0.00,,£0.00,,£0.00,,£0.00,,"-£6,000.00",,£0,£0,£0,£0,"-£6,000"',
    );
  });

  it("lays out a household with no accounts as the sums' headings and a row of nothings", () => {
    expect(balancesSheet([], "2026-01-02")).toBe(
      "Date,,Cash,,Investments,,Pension,,House Equity,,Car Equity,,Total,,Deferred,Free,Assets,Loans,UnSec\r\n" +
        "02/01/2026,,£0.00,,£0.00,,£0.00,,£0.00,,£0.00,,£0.00,,£0,£0,£0,£0,£0\r\n",
    );
  });
});
