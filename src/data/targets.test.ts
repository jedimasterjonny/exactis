// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Portfolio, Target, Targets } from "./targets";

import { areTargetsEquivalent } from "./targets";

const equityCategory: Target = {
  accounts: [
    { name: "Harbour ISA", value: 8400 },
    { name: "Harbour GIA", value: 1600 },
  ],
  classes: ["Equity", "Developed"],
  id: "cat-global-equity",
  isImplemented: true,
  name: "Global equity",
  share: 0.75,
  value: 10_000,
};

const bondCategory: Target = {
  accounts: [{ name: "Harbour ISA", value: 2500 }],
  classes: ["Bonds"],
  id: "cat-gilts",
  isImplemented: true,
  name: "Short-dated gilts",
  share: 0.25,
  value: 2500,
};

const isaPortfolio: Portfolio = {
  cash: 450,
  name: "Harbour ISA",
  paid: [
    { amount: 1200, on: "2026-08-25" },
    { amount: 800, on: "2026-09-25" },
  ],
};

const giaPortfolio: Portfolio = { cash: 120, name: "Harbour GIA", paid: [] };

const live = {
  categories: [equityCategory, bondCategory],
  portfolios: [isaPortfolio, giaPortfolio],
};

const kept: Targets = {
  categories: [equityCategory, bondCategory],
  importedOn: "2026-09-15",
  portfolios: [isaPortfolio, giaPortfolio],
};

describe("areTargetsEquivalent", () => {
  it("matches structurally identical targets regardless of object key order and importedOn", () => {
    const reorderedKept: Targets = Object.assign(
      {},
      { importedOn: "2026-09-01" },
      {
        portfolios: [
          Object.assign(
            {},
            {
              paid: [
                Object.assign({}, { on: "2026-08-25" }, { amount: 1200 }),
                Object.assign({}, { on: "2026-09-25" }, { amount: 800 }),
              ],
            },
            { name: "Harbour ISA" },
            { cash: 450 },
          ),
          Object.assign(
            {},
            { name: "Harbour GIA" },
            { paid: [] },
            { cash: 120 },
          ),
        ],
      },
      {
        categories: [
          Object.assign(
            {},
            { value: 10_000 },
            { share: 0.75 },
            { name: "Global equity" },
            { isImplemented: true },
            { id: "cat-global-equity" },
            { classes: ["Equity", "Developed"] },
            {
              accounts: [
                Object.assign({}, { value: 8400 }, { name: "Harbour ISA" }),
                Object.assign({}, { value: 1600 }, { name: "Harbour GIA" }),
              ],
            },
          ),
          Object.assign(
            {},
            { value: 2500 },
            { share: 0.25 },
            { name: "Short-dated gilts" },
            { isImplemented: true },
            { id: "cat-gilts" },
            { classes: ["Bonds"] },
            {
              accounts: [
                Object.assign({}, { value: 2500 }, { name: "Harbour ISA" }),
              ],
            },
          ),
        ],
      },
    );

    expect(JSON.stringify(reorderedKept.categories)).not.toBe(
      JSON.stringify(live.categories),
    );
    expect(JSON.stringify(reorderedKept.portfolios)).not.toBe(
      JSON.stringify(live.portfolios),
    );
    expect(areTargetsEquivalent(reorderedKept, live)).toBe(true);
  });

  it("returns false when kept is null or omits portfolios", () => {
    expect(areTargetsEquivalent(null, live)).toBe(false);
    expect(
      areTargetsEquivalent(
        { categories: [equityCategory], importedOn: "2026-09-15" },
        { categories: [equityCategory], portfolios: [] },
      ),
    ).toBe(false);
  });

  it("matches reordered categories with identical fields by id", () => {
    expect(
      areTargetsEquivalent(
        { ...kept, categories: [bondCategory, equityCategory] },
        live,
      ),
    ).toBe(true);
    expect(
      areTargetsEquivalent(kept, {
        ...live,
        categories: [bondCategory, equityCategory],
      }),
    ).toBe(true);
  });

  it("compares category lengths, ids, scalar fields, and classes", () => {
    expect(
      areTargetsEquivalent({ ...kept, categories: [equityCategory] }, live),
    ).toBe(false);
    expect(
      areTargetsEquivalent(kept, { ...live, categories: [equityCategory] }),
    ).toBe(false);
    expect(
      areTargetsEquivalent(
        { ...kept, categories: [equityCategory, equityCategory] },
        live,
      ),
    ).toBe(false);
    expect(
      areTargetsEquivalent(
        {
          ...kept,
          categories: [{ ...equityCategory, id: "cat-other" }, bondCategory],
        },
        live,
      ),
    ).toBe(false);
    expect(
      areTargetsEquivalent(
        {
          ...kept,
          categories: [
            { ...equityCategory, name: "World equity" },
            bondCategory,
          ],
        },
        live,
      ),
    ).toBe(false);
    expect(
      areTargetsEquivalent(
        {
          ...kept,
          categories: [
            { ...equityCategory, isImplemented: false },
            bondCategory,
          ],
        },
        live,
      ),
    ).toBe(false);
    expect(
      areTargetsEquivalent(
        {
          ...kept,
          categories: [{ ...equityCategory, share: 0.7 }, bondCategory],
        },
        live,
      ),
    ).toBe(false);
    expect(
      areTargetsEquivalent(
        {
          ...kept,
          categories: [{ ...equityCategory, value: 10_001 }, bondCategory],
        },
        live,
      ),
    ).toBe(false);
    expect(
      areTargetsEquivalent(
        {
          ...kept,
          categories: [
            { ...equityCategory, classes: ["Equity"] },
            bondCategory,
          ],
        },
        live,
      ),
    ).toBe(false);
    expect(
      areTargetsEquivalent(
        {
          ...kept,
          categories: [
            { ...equityCategory, classes: ["Equity", "Emerging"] },
            bondCategory,
          ],
        },
        live,
      ),
    ).toBe(false);
  });

  it("compares optional category accounts, distinguishing undefined from empty arrays", () => {
    const withoutAccounts: Target = {
      classes: ["Bonds"],
      id: "cat-gilts",
      isImplemented: true,
      name: "Short-dated gilts",
      share: 1,
      value: 0,
    };
    const withEmptyAccounts: Target = { ...withoutAccounts, accounts: [] };

    expect(
      areTargetsEquivalent(
        {
          categories: [withoutAccounts],
          importedOn: "2026-09-15",
          portfolios: [],
        },
        { categories: [withoutAccounts], portfolios: [] },
      ),
    ).toBe(true);
    expect(
      areTargetsEquivalent(
        {
          categories: [withoutAccounts],
          importedOn: "2026-09-15",
          portfolios: [],
        },
        { categories: [withEmptyAccounts], portfolios: [] },
      ),
    ).toBe(false);
    expect(
      areTargetsEquivalent(
        {
          categories: [withEmptyAccounts],
          importedOn: "2026-09-15",
          portfolios: [],
        },
        { categories: [withoutAccounts], portfolios: [] },
      ),
    ).toBe(false);
    expect(
      areTargetsEquivalent(
        {
          ...kept,
          categories: [
            {
              ...equityCategory,
              accounts: [
                { name: "Other ISA", value: 8400 },
                { name: "Harbour GIA", value: 1600 },
              ],
            },
            bondCategory,
          ],
        },
        live,
      ),
    ).toBe(false);
    expect(
      areTargetsEquivalent(
        {
          ...kept,
          categories: [
            {
              ...equityCategory,
              accounts: [
                { name: "Harbour ISA", value: 8401 },
                { name: "Harbour GIA", value: 1600 },
              ],
            },
            bondCategory,
          ],
        },
        live,
      ),
    ).toBe(false);
  });

  it("compares portfolios by length, order, name, cash, and paid entries", () => {
    expect(
      areTargetsEquivalent({ ...kept, portfolios: [isaPortfolio] }, live),
    ).toBe(false);
    expect(
      areTargetsEquivalent(kept, { ...live, portfolios: [isaPortfolio] }),
    ).toBe(false);
    expect(
      areTargetsEquivalent(
        { ...kept, portfolios: [giaPortfolio, isaPortfolio] },
        live,
      ),
    ).toBe(false);
    expect(
      areTargetsEquivalent(
        {
          ...kept,
          portfolios: [{ ...isaPortfolio, name: "Other ISA" }, giaPortfolio],
        },
        live,
      ),
    ).toBe(false);
    expect(
      areTargetsEquivalent(
        { ...kept, portfolios: [{ ...isaPortfolio, cash: 451 }, giaPortfolio] },
        live,
      ),
    ).toBe(false);
    expect(
      areTargetsEquivalent(
        {
          ...kept,
          portfolios: [
            {
              ...isaPortfolio,
              paid: [
                { amount: 1200, on: "2026-08-26" },
                { amount: 800, on: "2026-09-25" },
              ],
            },
            giaPortfolio,
          ],
        },
        live,
      ),
    ).toBe(false);
    expect(
      areTargetsEquivalent(
        {
          ...kept,
          portfolios: [
            {
              ...isaPortfolio,
              paid: [
                { amount: 1201, on: "2026-08-25" },
                { amount: 800, on: "2026-09-25" },
              ],
            },
            giaPortfolio,
          ],
        },
        live,
      ),
    ).toBe(false);
  });
});
