// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Cma, Vintages } from "@/data/cma";
import type { Kept } from "@/data/household";
import type { Curve } from "@/data/inflation";
import type { Target, Targets } from "@/data/targets";

import { cma } from "@/data/cma.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { soundKept } from "@/data/household";
import { kept } from "@/data/household.fixture";
import { curve } from "@/data/inflation.fixture";
import { currentShape, stamped } from "@/data/shapes";
import { portfolios, targets } from "@/data/targets.fixture";
import { Refusal } from "@/lib/answer";

import { forkOf, planOver } from "./plan-over";

// A pull the scenario holds and the household's beside it, either
// none, and whose the merge keeps.
interface Pulling<TPull> {
  readonly name: string;
  readonly ours: TPull;
  readonly side: "household" | "scenario";
  readonly theirs: TPull;
}

// Why a household holding an account the scenario's own copy never held
// keeps the two apart, as the merge says it.
const added =
  "The household holds an account that was not in this scenario when it was made, so the scenario cannot be laid over the household; delete the account from the household first, and add it again after if it is still wanted; if this scenario holds it now, redo its changes in a new scenario made from the household instead";

// An invented cash account under the id the reference household's next
// stands at, as a save there or in a scenario made from it gives one.
const opened = {
  balance: 4000,
  growth: { kind: "fixed", rate: 0.04 },
  id: 20,
  kind: "cash",
  name: "Premium bonds",
} as const;

// Why the household's import and the scenario's cannot be merged where
// one lists a category asking a share that the other does not, as the
// merge says it.
const unlaid =
  "The household's last import and the scenario's do not list the same categories with a target above 0%, so the scenario's targets cannot be laid over the household's; import from Portfolio Performance in the scenario first, then retarget it again if it was retargeted";

// The reference categories, by id, that the tests move.
const developed = "Asset Allocation/Equity/Developed/FTSE Global All Cap ex-UK";
const emerging = "Asset Allocation/Equity/Global emerging markets";
const smaller = "Asset Allocation/Equity/Global small cap";
const usa = "Asset Allocation/Equity/Developed/FTSE USA";
const global = "Asset Allocation/Bonds/Global bonds, hedged";
const linked = "Asset Allocation/Bonds/Index-linked gilts";
const short = "Asset Allocation/Bonds/Short-dated gilts";

// A cash reserve beneath the bonds, as an import can list one, asking
// for nothing and holding nothing.
const reserve: Target = {
  accounts: [],
  classes: ["Bonds"],
  id: "Asset Allocation/Bonds/Cash reserve",
  isImplemented: false,
  name: "Cash reserve",
  share: 0,
  value: 0,
};

// The reference allocation as imported on the 26th of August 2026, when
// each category held a tenth less than it does now, and the ISA alone
// had its cash and paid in read, an invented £300 and August's £1,500.
const august: Targets = {
  categories: targets.categories.map((category) => ({
    ...category,
    value: Math.round(category.value * 0.9),
  })),
  importedOn: "2026-08-26",
  portfolios: [
    {
      cash: 300,
      name: "Stocks & shares ISA",
      paid: [{ amount: 1500, on: "2026-08-25" }],
    },
  ],
};

// The same file imported again on the 26th of September 2026, holding
// what the reference does, with every account's cash and paid in.
const september: Targets = { ...targets, importedOn: "2026-09-26", portfolios };

// The household as it stands, imported in September.
const household: Kept = { ...kept, targets: september };

// The pulls the tests make, each invented: November 2026's vintage,
// every class priced a fifth of a point above August's, kept over
// August's; April's, kept before August's; and a curve the Bank gave on
// the first of October.
const november: Cma = {
  ...cma,
  asOf: "2026-10-30",
  assets: cma.assets.map((asset) => ({ ...asset, rate: asset.rate + 0.002 })),
  vintage: { month: 10, year: 2026 },
};
const april: Cma = {
  ...cma,
  asOf: "2026-03-31",
  vintage: { month: 3, year: 2026 },
};
const pulledNovember: Vintages = { latest: november, previous: cma };
const october: Curve = {
  asOf: "2026-10-01",
  implied: { 5: 0.0331, 10: 0.0327, 20: 0.0322, 30: 0.0318 },
};

// The scenario laid over the household given, or the September one.
function adopted(scenario: Kept, over: Kept = household): Kept {
  return planOver(over, scenario, forkOf(kept));
}

// An import with its categories, by id, changed as given.
function edited(
  from: Targets,
  changes: Readonly<Record<string, Partial<Target>>>,
): Targets {
  return {
    ...from,
    categories: from.categories.map((category) => ({
      ...category,
      ...changes[category.id],
    })),
  };
}

// The household with its September import listing the categories given
// in place of its own.
function importing(categories: readonly Target[]): Kept {
  return { ...household, targets: { ...september, categories } };
}

// The merge's categories, each by its name, the classes it sits beneath
// and the share it asks.
function listed(merged: Kept): readonly (readonly [string, string, number])[] {
  return (merged.targets?.categories ?? []).map(({ classes, name, share }) => [
    name,
    classes.join(" › "),
    share,
  ]);
}

// An import retargeted as the scenario retargets one, from 48% in
// developed equity and 14% in global bonds to 40% and 22%.
function retargeted(from: Targets): Targets {
  return edited(from, {
    [developed]: { share: 0.4 },
    [global]: { share: 0.22 },
  });
}

// A scenario made from the household in August, its plan run to 95 and
// its allocation retargeted, with whatever a test gives in their place.
function scenarioOf(changes: Partial<Kept> = {}): Kept {
  return {
    ...kept,
    ages: { ends: 95 },
    targets: retargeted(august),
    ...changes,
  };
}

describe("forkOf", () => {
  // The copy listing an account twice with its next below every id, as
  // a version kept before those rules tightened would break them; and
  // one a newer app kept.
  it("reads the copy a scenario was made from for its accounts' ids alone, through the chain, so a rule it breaks refuses nothing", () => {
    expect(
      forkOf(
        stamped({
          ...kept,
          accounts: [...kept.accounts, ...kept.accounts.slice(0, 1)],
          next: 1,
        }),
      ),
    ).toStrictEqual(new Set([2, 3, 4, 5, 6]));
    expect(() => forkOf({ ...kept, shape: currentShape + 1 })).toThrow(
      new Refusal("This household was saved by a newer app than this one"),
    );
  });
});

describe("planOver", () => {
  // A cash ISA opened in the household after the copy was made, under
  // the id the copy's next stood at; and the same where the copy is a
  // parent scenario's that had given that id to a line of its own, so the
  // id sits below the copy's next while no account of the copy holds it.
  it("refuses, in its words, a household holding an account the scenario's own copy never held, wherever its id falls", () => {
    const over = {
      ...household,
      accounts: [...household.accounts, { ...opened, name: "Cash ISA" }],
      next: 21,
    };
    const parent = {
      ...kept,
      next: 21,
      schedule: {
        ...kept.schedule,
        expenses: [...expenseLines, { ...expenseLines[0], id: 20 }],
      },
    };

    expect(() => adopted(scenarioOf(), over)).toThrow(new Refusal(added));
    expect(() =>
      planOver(over, scenarioOf({ next: 21 }), forkOf(parent)),
    ).toThrow(new Refusal(added));
  });

  // A cash ISA opened in the household under the id its next stood at,
  // and premium bonds opened in a parent scenario under the first id of
  // its own range, 2,000 past it, before this one was made from it.
  it("refuses a household account the copy never held where the account a parent opened beside it took an id from the parent's own range", () => {
    const copy = {
      ...kept,
      accounts: [...kept.accounts, { ...opened, id: 2020 }],
      next: 4021,
    };

    expect(() =>
      planOver(
        {
          ...household,
          accounts: [...household.accounts, { ...opened, name: "Cash ISA" }],
          next: 21,
        },
        scenarioOf({ accounts: copy.accounts, next: 4021 }),
        forkOf(copy),
      ),
    ).toThrow(new Refusal(added));
  });

  // Premium bonds opened in a parent scenario before this one was made
  // from it, which the household holds since at a balance set on the
  // twelfth, through a sibling or the parent made the household.
  it("lays the scenario over a household holding only accounts its copy held, each at the household's balance", () => {
    const recorded = { ...opened, balance: 4100, setOn: "2026-09-12" };
    const copy = { ...kept, accounts: [...kept.accounts, opened], next: 21 };
    const merged = planOver(
      { ...household, accounts: [...household.accounts, recorded], next: 21 },
      scenarioOf({ accounts: copy.accounts, next: 21 }),
      forkOf(copy),
    );

    expect(merged.accounts).toStrictEqual([...kept.accounts, recorded]);
    expect(soundKept(merged).kept).toStrictEqual(merged);
  });

  it("keeps the household's import, its day, cash and paid in, under the scenario's shares, where the household imported since the scenario was made", () => {
    const merged = adopted(scenarioOf());

    expect(merged.targets).toStrictEqual(retargeted(september));
    expect(merged.ages).toStrictEqual({ ends: 95 });
    expect(soundKept(merged).kept).toStrictEqual(merged);
  });

  // The scenario retargeted on September's file after the household's
  // last import, of August's.
  it("keeps the scenario's own import whole where it is the newer", () => {
    const scenario = scenarioOf({ targets: retargeted(september) });

    expect(
      adopted(scenario, { ...kept, targets: august }).targets,
    ).toStrictEqual(scenario.targets);
  });

  // The household imported its file again later on the day the scenario
  // was retargeted, from a copy holding August's holdings.
  it("lays the scenario's shares over the household's import made the same day", () => {
    const scenario = scenarioOf({
      targets: retargeted({ ...august, importedOn: "2026-09-26" }),
    });

    expect(adopted(scenario).targets).toStrictEqual(retargeted(september));
  });

  // Global small cap renamed and asking 10% in the household's import,
  // emerging markets 10%, and the short-dated gilts moved under a class
  // of their own, each keeping its id.
  it("keeps the household's names and classes under the scenario's shares, for a category renamed or moved under another class", () => {
    const over = {
      ...household,
      targets: edited(september, {
        [emerging]: { share: 0.1 },
        [short]: { classes: ["Bonds", "Gilts"] },
        [smaller]: { name: "Global smaller companies", share: 0.1 },
      }),
    };

    expect(listed(adopted(scenarioOf(), over))).toStrictEqual([
      ["FTSE Global All Cap ex-UK", "Equity › Developed", 0.4],
      ["Global emerging markets", "Equity", 0.12],
      ["UK equity", "Equity › UK", 0.12],
      ["Global smaller companies", "Equity", 0.08],
      ["FTSE USA", "Equity › Developed", 0],
      ["FTSE All-Share", "Equity › UK", 0],
      ["Global bonds, hedged", "Bonds", 0.22],
      ["Index-linked gilts", "Bonds", 0.04],
      ["Short-dated gilts", "Bonds › Gilts", 0.02],
    ]);
  });

  // The scenario's file listing its categories the other way up, and the
  // household's import since adding the cash reserve.
  it("lists the merge in the scenario's order, a category only the household's import lists after them", () => {
    const scenario = retargeted(august);
    const merged = adopted(
      scenarioOf({
        targets: { ...scenario, categories: scenario.categories.toReversed() },
      }),
      importing([...september.categories, reserve]),
    );

    expect(listed(merged).map(([name]) => name)).toStrictEqual([
      "Short-dated gilts",
      "Index-linked gilts",
      "Global bonds, hedged",
      "FTSE All-Share",
      "FTSE USA",
      "Global small cap",
      "UK equity",
      "Global emerging markets",
      "FTSE Global All Cap ex-UK",
      "Cash reserve",
    ]);
    expect(soundKept(merged).kept).toStrictEqual(merged);
  });

  // The household's import since dropping FTSE USA, which asks nothing
  // in either; and, in another, adding the cash reserve.
  it("merges a category only one import lists where it asks 0%, keeping the household's and dropping the scenario's", () => {
    const dropped = adopted(
      scenarioOf(),
      importing(september.categories.filter(({ id }) => id !== usa)),
    );

    expect(listed(dropped).map(([name]) => name)).not.toContain("FTSE USA");
    expect(soundKept(dropped).kept).toStrictEqual(dropped);
    expect(
      adopted(scenarioOf(), importing([...september.categories, reserve]))
        .targets?.categories,
    ).toContainEqual(reserve);
  });

  // The household's import since adding the cash reserve, which the
  // household then mapped onto UK cash, beside a mapping it kept for a
  // class neither import lists; and a scenario mapping one category fewer
  // of those both list, or mapping the reserve too, onto global bonds.
  it("keeps the household's mapping for a category only its import lists where the scenario holds none for it, and no other", () => {
    const cash = { asset: "UK cash", category: reserve.id };
    const over = {
      ...importing([...september.categories, reserve]),
      mappings: [
        ...kept.mappings,
        cash,
        { asset: "UK cash", category: "Asset Allocation/Bonds/Retired" },
      ],
    };
    const fewer = adopted(
      scenarioOf({ mappings: kept.mappings.slice(1) }),
      over,
    );
    const ours = [
      ...kept.mappings,
      { asset: "Global aggregate bonds (GBP hedged)", category: reserve.id },
    ];
    const both = adopted(scenarioOf({ mappings: ours }), over);

    expect(fewer.mappings).toStrictEqual([...kept.mappings.slice(1), cash]);
    expect(soundKept(fewer).kept).toStrictEqual(fewer);
    expect(both.mappings).toStrictEqual(ours);
    expect(soundKept(both).kept).toStrictEqual(both);
  });

  // The household's import since adding frontier markets at 5%, out of
  // emerging markets; and, in another, dropping the index-linked gilts
  // the scenario asks 4% of, into the short-dated ones.
  it("refuses, in its words, a household import listing a category asking a share the scenario's does not list, or not listing one the scenario's asks a share of", () => {
    const frontier = {
      ...reserve,
      classes: ["Equity"],
      id: "Asset Allocation/Equity/Frontier markets",
      name: "Frontier markets",
      share: 0.05,
    };

    expect(() =>
      adopted(
        scenarioOf(),
        importing([
          ...edited(september, { [emerging]: { share: 0.07 } }).categories,
          frontier,
        ]),
      ),
    ).toThrow(new Refusal(unlaid));
    expect(() =>
      adopted(
        scenarioOf(),
        importing(
          edited(september, { [short]: { share: 0.06 } }).categories.filter(
            ({ id }) => id !== linked,
          ),
        ),
      ),
    ).toThrow(new Refusal(unlaid));
  });

  // A scenario made before the household's first import, on the rates
  // typed, as a plan with no allocation to blend the CMA's by must be.
  it("keeps the household's allocation whole, its mappings among it, where the scenario holds none, so it runs on the CMA's rates as the household would", () => {
    const merged = adopted(scenarioOf({ mappings: [], targets: null }));

    expect(merged.targets).toBe(household.targets);
    expect(merged.mappings).toBe(household.mappings);
    expect(
      soundKept({ ...merged, rateSet: "cma" }).household.liveRates,
    ).toStrictEqual(
      soundKept({ ...household, rateSet: "cma" }).household.liveRates,
    );
  });

  // The scenario with one category fewer mapped than the household.
  it("keeps the scenario's allocation where the household holds none, and none where neither does", () => {
    const scenario = scenarioOf({ mappings: kept.mappings.slice(1) });
    const merged = adopted(scenario, { ...kept, targets: null });

    expect(merged.targets).toBe(scenario.targets);
    expect(merged.mappings).toBe(scenario.mappings);
    expect(
      adopted(scenarioOf({ targets: null }), { ...kept, targets: null })
        .targets,
    ).toBeNull();
  });

  // The household's fees confirmed still right on the 27th of September,
  // after the scenario was made with them set on the 2nd.
  it("keeps the household's fees and the day it confirmed them where the scenario left them as they are", () => {
    const confirmed = { ...kept.deductions, setOn: "2026-09-27" };

    expect(
      adopted(
        scenarioOf({ deductions: { ...kept.deductions, setOn: "2026-09-02" } }),
        { ...household, deductions: confirmed },
      ).deductions,
    ).toBe(confirmed);
  });

  // The scenario's fees typed at an invented 0.15% on the 2nd, or
  // confirmed still right on the 29th.
  it("takes the scenario's fees where it changed them, or confirmed them later", () => {
    const over = {
      ...household,
      deductions: { ...kept.deductions, setOn: "2026-09-27" },
    };
    const typed = { ...kept.deductions, fees: 0.0015, setOn: "2026-09-02" };
    const later = { ...kept.deductions, setOn: "2026-09-29" };

    expect(adopted(scenarioOf({ deductions: typed }), over).deductions).toBe(
      typed,
    );
    expect(adopted(scenarioOf({ deductions: later }), over).deductions).toBe(
      later,
    );
  });

  // The same fees set on the 27th on one side and undated, as the ones a
  // household opens with are, on the other.
  it("takes the dated fees where the two read the same and the other is undated", () => {
    const dated = { ...kept.deductions, setOn: "2026-09-27" };

    expect(adopted(scenarioOf({ deductions: dated })).deductions).toBe(dated);
    expect(
      adopted(scenarioOf(), { ...household, deductions: dated }).deductions,
    ).toBe(dated);
  });

  it.each<Pulling<null | Vintages>>([
    {
      name: "the scenario's at a later vintage",
      ours: pulledNovember,
      side: "scenario",
      theirs: kept.cma,
    },
    {
      name: "the scenario's of the same vintage, published later",
      ours: { latest: { ...cma, asOf: "2026-07-15" }, previous: null },
      side: "scenario",
      theirs: kept.cma,
    },
    {
      name: "the scenario's where the household holds none",
      ours: kept.cma,
      side: "scenario",
      theirs: null,
    },
    {
      name: "the household's on the same vintage and day, whatever came before it",
      ours: { latest: cma, previous: april },
      side: "household",
      theirs: kept.cma,
    },
    {
      name: "the household's over an earlier vintage",
      ours: kept.cma,
      side: "household",
      theirs: pulledNovember,
    },
    {
      name: "the household's over the same vintage, published earlier",
      ours: { latest: { ...cma, asOf: "2026-06-15" }, previous: null },
      side: "household",
      theirs: kept.cma,
    },
    {
      name: "the household's where the scenario holds none",
      ours: null,
      side: "household",
      theirs: kept.cma,
    },
    {
      name: "none where neither holds one",
      ours: null,
      side: "household",
      theirs: null,
    },
  ])(
    "keeps the newer CMA of the two whole, the household's on a tie: $name",
    ({ ours, side, theirs }) => {
      const merged = adopted(scenarioOf({ cma: ours }), {
        ...household,
        cma: theirs,
      });

      expect(merged.cma).toBe(side === "scenario" ? ours : theirs);
    },
  );

  it.each<Pulling<Curve | null>>([
    {
      name: "the scenario's on a later day",
      ours: october,
      side: "scenario",
      theirs: curve,
    },
    {
      name: "the scenario's where the household holds none",
      ours: curve,
      side: "scenario",
      theirs: null,
    },
    {
      name: "the household's on the same day, whatever the rates",
      ours: { ...october, asOf: curve.asOf },
      side: "household",
      theirs: curve,
    },
    {
      name: "the household's over an earlier day",
      ours: { ...october, asOf: "2026-08-01" },
      side: "household",
      theirs: curve,
    },
    {
      name: "the household's where the scenario holds none",
      ours: null,
      side: "household",
      theirs: curve,
    },
    {
      name: "none where neither holds one",
      ours: null,
      side: "household",
      theirs: null,
    },
  ])(
    "keeps the newer curve of the two, the household's on a tie: $name",
    ({ ours, side, theirs }) => {
      const merged = adopted(scenarioOf({ curve: ours }), {
        ...household,
        curve: theirs,
      });

      expect(merged.curve).toBe(side === "scenario" ? ours : theirs);
    },
  );

  // The scenario pulled November's vintage after it was made, and the
  // household imported again since, both on the CMA's rates.
  it("derives the scenario's own rates and spread from its later vintage, under the household's later import", () => {
    const scenario = scenarioOf({ cma: pulledNovember, rateSet: "cma" });
    const merged = adopted(scenario, { ...household, rateSet: "cma" });
    const ours = soundKept(scenario).household;
    const laid = soundKept(merged).household;

    expect(merged.cma).toBe(scenario.cma);
    expect(merged.targets?.importedOn).toBe(september.importedOn);
    expect(laid.liveRates).toStrictEqual(ours.liveRates);
    expect(laid.spread).toStrictEqual(ours.spread);
  });

  // November's vintage with its small cap class under another name, and
  // the scenario's small cap remapped onto it, which August's does not
  // price.
  it("derives where the scenario maps onto a class only its later vintage prices", () => {
    const renamed = "Global smaller companies equities";
    const scenario = scenarioOf({
      cma: {
        latest: {
          ...november,
          assets: november.assets.map((asset) =>
            asset.name === "Global small cap equities"
              ? { ...asset, name: renamed }
              : asset,
          ),
        },
        previous: cma,
      },
      mappings: kept.mappings.map((mapping) =>
        mapping.category === smaller ? { ...mapping, asset: renamed } : mapping,
      ),
      rateSet: "cma",
    });

    expect(
      soundKept(adopted(scenario, { ...household, rateSet: "cma" })).household
        .liveRates,
    ).toStrictEqual(soundKept(scenario).household.liveRates);
  });
});
