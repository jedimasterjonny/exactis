import { describe, expect, it } from "vitest";

import { isAsset, toAccount, toValues } from "./accounts";
import { accounts } from "./accounts.fixture";

describe("accounts", () => {
  it("files a real asset and a debt as assets and the rest as accounts", () => {
    expect(
      accounts.filter(isAsset).map((account) => account.kind),
    ).toStrictEqual(["real-asset", "debt"]);
    expect(
      accounts.filter((account) => !isAsset(account)).map((a) => a.kind),
    ).toStrictEqual(["tax-deferred", "tax-free", "cash"]);
  });

  it("reads a contribution and a fixed rate off an account and back", () => {
    const values = {
      balance: -182940,
      cadence: "month",
      contribution: 2210,
      growth: "fixed",
      kind: "debt",
      name: "Mortgage",
      rate: 0.0515,
    } as const;

    const account = toAccount(values, 5);

    expect(account).toStrictEqual(accounts[4]);
    expect(toValues(account)).toStrictEqual(values);
  });

  it("drops a contribution of nothing and a plan rate's rate", () => {
    const account = toAccount(
      {
        balance: 4000,
        cadence: "month",
        contribution: 0,
        growth: "plan",
        kind: "tax-free",
        name: "Lifetime ISA",
        rate: 0.03,
      },
      6,
    );

    expect(account).toStrictEqual({
      balance: 4000,
      growth: { kind: "plan" },
      id: 6,
      kind: "tax-free",
      name: "Lifetime ISA",
    });
    expect(toValues(account)).toStrictEqual({
      balance: 4000,
      cadence: "year",
      contribution: 0,
      growth: "plan",
      kind: "tax-free",
      name: "Lifetime ISA",
      rate: 0,
    });
  });
});
