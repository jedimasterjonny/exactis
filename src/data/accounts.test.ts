import { describe, expect, it } from "vitest";

import {
  allowanceOf,
  isAsset,
  takesSpare,
  toAccount,
  toValues,
} from "./accounts";
import { accounts } from "./accounts.fixture";

describe("accounts", () => {
  it("files a real asset as an asset and the rest, the loan against it among them, as accounts", () => {
    expect(
      accounts.filter(isAsset).map((account) => account.kind),
    ).toStrictEqual(["real-asset"]);
    expect(
      accounts.filter((account) => !isAsset(account)).map((a) => a.kind),
    ).toStrictEqual(["tax-deferred", "tax-free", "cash", "debt"]);
  });

  it("pays a wrapper or cash the spare money and a real asset or a debt a fixed sum only", () => {
    expect(
      accounts.filter(takesSpare).map((account) => account.kind),
    ).toStrictEqual(["tax-deferred", "tax-free", "cash"]);
    expect(
      accounts.filter((account) => !takesSpare(account)).map((a) => a.kind),
    ).toStrictEqual(["real-asset", "debt"]);
  });

  it("reads a contribution and a fixed rate off an account and back", () => {
    const values = {
      balance: -182940,
      balloon: 0,
      cadence: "month",
      cap: 0,
      contribution: 2210,
      funding: "fixed",
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
        balloon: 0,
        cadence: "month",
        cap: 0,
        contribution: 0,
        funding: "fixed",
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
      balloon: 0,
      cadence: "year",
      cap: 0,
      contribution: 0,
      funding: "fixed",
      growth: "plan",
      kind: "tax-free",
      name: "Lifetime ISA",
      rate: 0,
    });
  });

  // The sum and the cadence are dropped with the spare money, so the
  // values come back with nothing a year, whatever was typed before the
  // choice changed; and a cap of nothing is no cap on the account, which
  // is the allowance its kind has.
  it("reads the spare money off an account with and without a cap", () => {
    const values = {
      balance: 4000,
      balloon: 0,
      cadence: "month",
      cap: 4000,
      contribution: 333,
      funding: "spare",
      growth: "plan",
      kind: "tax-free",
      name: "Lifetime ISA",
      rate: 0,
    } as const;

    const capped = toAccount(values, 6);
    const uncapped = toAccount({ ...values, cap: 0 }, 7);

    expect(capped.contribution).toStrictEqual({ cap: 4000, kind: "spare" });
    expect(uncapped.contribution).toStrictEqual({ cap: null, kind: "spare" });
    expect(toValues(capped)).toStrictEqual({
      ...values,
      cadence: "year",
      contribution: 0,
    });
    expect(toValues(uncapped)).toStrictEqual({
      ...values,
      cadence: "year",
      cap: 0,
      contribution: 0,
    });
  });
});

describe("isAsset", () => {
  it("files a house and a car with the real assets, paid a fixed sum only", () => {
    expect(isAsset({ kind: "house" })).toBe(true);
    expect(takesSpare({ kind: "house" })).toBe(false);
    expect(isAsset({ kind: "car" })).toBe(true);
    expect(takesSpare({ kind: "car" })).toBe(false);
  });
});

describe("balloon", () => {
  // A PCP's loan carries the balloon it is left owing; a balloon of
  // nothing is no balloon on the account, and comes back as nothing.
  it("reads a balloon off a loan and back, and drops one of nothing", () => {
    const [, , , , mortgage] = accounts;
    const values = { ...toValues(mortgage), balloon: 8000 };

    expect(toAccount(values, 5)).toStrictEqual({ ...mortgage, balloon: 8000 });
    expect(toValues(toAccount(values, 5))).toStrictEqual(values);
    expect(toAccount({ ...values, balloon: 0 }, 5)).not.toHaveProperty(
      "balloon",
    );
  });
});

describe("allowanceOf", () => {
  it("gives the ISA and the pension the UK's yearly allowances and the rest none", () => {
    expect(allowanceOf("tax-free")).toBe(20000);
    expect(allowanceOf("tax-deferred")).toBe(60000);
    expect(allowanceOf("car")).toBeNull();
    expect(allowanceOf("cash")).toBeNull();
    expect(allowanceOf("house")).toBeNull();
    expect(allowanceOf("real-asset")).toBeNull();
    expect(allowanceOf("debt")).toBeNull();
  });
});
