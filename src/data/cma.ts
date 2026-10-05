import type { Curve } from "@/data/inflation";
import type { Allocation, Rates } from "@/data/rates";
import type { Month } from "@/data/schedule";
import type { Target, Targets } from "@/data/targets";

import { inflationOf } from "@/data/inflation";
import { monthName } from "@/lib/months";

// An asset class as BlackRock's capital market assumptions price it in
// sterling: its name, the class of the plan its return blends into,
// and the return expected of it a year over the horizon, a fraction,
// nominal and geometric as BlackRock quotes it. One hedged to sterling,
// which BlackRock prices hedged only in dollars, names the class it is
// the hedged form of, and one BlackRock prices only in another
// currency, carried into sterling, names that currency. Each carries
// how far BlackRock expects it to stray, and none was kept by a vintage
// pulled before that was read, or for a class BlackRock gives no
// volatility.
export interface Asset {
  readonly carriedFrom?: string;
  readonly hedges?: string;
  readonly name: string;
  readonly rate: number;
  readonly risk?: Risk;
  readonly sleeve: Sleeve;
}

// What a sleeve's blend comes to: the share of the whole the target
// allocation holds in it, the categories blended into it, the return
// they blend to with each class hedged to sterling at the return of the
// class it hedges, and the adjustment the hedging makes to that, each a
// fraction a year. The blend's return in all is the two added.
export interface Blend {
  readonly hedging: number;
  readonly parts: readonly Part[];
  readonly rate: number;
  readonly share: number;
}

// The two sleeves' blends, or why the target allocation and the
// mappings make none.
export type Blends =
  Shortfall | { readonly bonds: Blend; readonly stocks: Blend };

// A vintage of BlackRock's capital market assumptions: the month it was
// published in, the day its data are as of, as an ISO date, and the
// asset classes it prices in sterling that a fund can hold, in the
// order its workbook lists them; and how government bonds and equities
// move together, their correlation, which every class's correlations
// with the two are read against, none for a vintage pulled before it
// was read or a workbook that does not say.
export interface Cma {
  readonly asOf: string;
  readonly assets: readonly Asset[];
  readonly correlation?: number;
  readonly vintage: Month;
}

// What comes off a blend's return in all to make a growth rate, each a
// fraction a year: the yield split out of stocks' return, which the plan
// adds back on top of their growth, and the fees charged on every fund,
// which BlackRock's index returns are gross of and the plan charges
// nowhere else. Neither moves when a source is pulled, so they keep the
// day they were last typed or confirmed still right, as an ISO date, to
// say how long they have stood; none for the ones a household opens
// with, or kept before the day was.
export interface Deductions {
  readonly dividends: number;
  readonly fees: number;
  readonly setOn?: string;
}

// What the CMA gives the plan to run on: the rates, and the split of the
// savings between stocks and bonds.
export interface DerivedSet {
  readonly allocation: Allocation;
  readonly rates: Rates;
}

// A category of the target allocation mapped onto an asset class a
// vintage prices: the category by the id Portfolio Performance gives
// it, which a file saved again keeps, and the class by its name.
export interface Mapping {
  readonly asset: string;
  readonly category: string;
}

// How far an asset class strays in a year as BlackRock expects it to:
// the standard deviation of its return a year, a fraction, and how it
// moves with government bonds and with equities, its correlation with
// each, the two every class BlackRock prices is correlated with.
export interface Risk {
  readonly bonds: number;
  readonly stocks: number;
  readonly volatility: number;
}

// Why the CMA gives the plan nothing: what is missing, in words naming
// it.
export interface Shortfall {
  readonly short: string;
}

// The plan's two classes, which an asset class's return blends into.
export type Sleeve = (typeof sleeves)[number];

// How far the plan's two sleeves stray in a year as a vintage expects:
// each sleeve's volatility, its classes' blended in the weights the
// target allocation gives them, and how the two move together.
export interface SleeveRisk {
  readonly bonds: number;
  readonly correlation: number;
  readonly stocks: number;
}

// The vintages of the capital market assumptions the household keeps:
// the latest pulled, and the one it replaced, or none before a second
// vintage is pulled, kept so what a new vintage moves can be read.
export interface Vintages {
  readonly latest: Cma;
  readonly previous: Cma | null;
}

// A category as it blends into its sleeve: the category, the class it
// is mapped onto, and its weight in the sleeve, its share of the whole
// over the sleeve's.
interface Part {
  readonly asset: Asset;
  readonly category: Target;
  readonly weight: number;
}

// A part whose class carries how far it strays.
interface Risked extends Part {
  readonly asset: Asset & { readonly risk: Risk };
}

export const sleeves = ["bonds", "stocks"] as const;

// What a household deducts from the CMA's returns before anything is
// typed: the figures the manual method settled on in September 2026.
// Fees of 0.20%, its estimate of 0.167% for the funds' charges and the
// platform's flat fee, rounded up as it was three runs running; the
// platform's share falls as the savings grow, so the figure is a start
// to type over rather than a reading. And a dividend yield of 2.00%,
// the index yields weighted by the equity sleeve, which moves only the
// split of stocks' return between growth and yield, never its total.
export const openingDeductions: Deductions = { dividends: 0.02, fees: 0.002 };

// Names as a sentence lists them, "A, B and C".
const listed = new Intl.ListFormat("en-GB", { type: "conjunction" });

// The return a vintage expects of each sleeve, blended by the target
// allocation: each category with a share of the whole weighted by its
// share of its sleeve, at the return of the class it is mapped onto,
// which says the sleeve. A category asking for nothing is left out,
// mapped or not, since it weighs nothing. A class hedged to sterling is
// blended at the return of the class it hedges, and what the hedging
// moves is kept apart as the adjustment, so the screen can show it, the
// two adding up to the class's own return. A sleeve nothing blends
// into, as bonds in an allocation all in equities, stands in at the
// other sleeve's return with no parts and none of the whole, so the rate
// it gives the plan weighs nothing in what the plan earns, and the
// screen, finding no parts, shows it as empty. There is no blend without
// a target allocation, with a category asking for a share and mapped
// onto no class, or onto one the vintage does not price, or with nothing
// asking for a share at all, and each is said in words naming what is
// missing, since the screen says why.
export function blendsOf(
  cma: Cma,
  targets: null | Targets,
  mappings: readonly Mapping[],
): Blends {
  if (targets === null) {
    return { short: "No target allocation is imported to weight the CMA by" };
  }
  const asked = targets.categories.filter(({ share }) => share > 0);
  const named = new Map(cma.assets.map((asset) => [asset.name, asset]));
  const pricedFor = new Map(
    mappings.flatMap(({ asset, category }) => {
      const found = named.get(asset);
      return found === undefined ? [] : [[category, found] as const];
    }),
  );
  const priced = asked.flatMap((category) => {
    const asset = pricedFor.get(category.id);
    return asset === undefined ? [] : [{ asset, category }];
  });
  const missing = asked.filter(
    (category) => !priced.some((part) => part.category === category),
  );
  const unmapped = missing.filter(
    ({ id }) => !mappings.some(({ category }) => category === id),
  );
  if (unmapped.length > 0) {
    return {
      short: `${listed.format(unmapped.map(({ name }) => name))} ${unmapped.length === 1 ? "has" : "have"} no CMA class`,
    };
  }
  if (missing.length > 0) {
    return {
      short: `${listed.format(missing.map(({ name }) => name))} ${missing.length === 1 ? "is" : "are"} mapped onto a class the ${vintageName(cma)} CMA does not price`,
    };
  }
  const bySleeve = Object.groupBy(priced, ({ asset }) => asset.sleeve);
  const bonds = blendOf(bySleeve.bonds ?? [], named);
  const stocks = blendOf(bySleeve.stocks ?? [], named);
  const standIn = stocks ?? bonds;
  if (standIn === undefined) {
    return { short: "Nothing in the target allocation asks for a share" };
  }
  const empty = { ...standIn, parts: [], share: 0 };
  return { bonds: bonds ?? empty, stocks: stocks ?? empty };
}

// The rates the plan runs on when they are derived from a vintage:
// stocks growing at their blend's return in all less the fees and the
// yield split out, which is their dividend yield, bonds at theirs less
// the fees, and the inflation given, which is the curve's.
export function cmaRates(
  { bonds, stocks }: { readonly bonds: Blend; readonly stocks: Blend },
  { dividends, fees }: Deductions,
  inflation: number,
): Rates {
  return {
    bonds: bonds.rate + bonds.hedging - fees,
    dividends,
    inflation,
    stocks: stocks.rate + stocks.hedging - fees - dividends,
  };
}

// What the household's latest vintage gives the plan to run on. The
// rates are its blends by the target allocation and the mappings less
// the deductions, with the inflation the curve gives, since BlackRock's
// returns are nominal and the market's inflation is the one they are
// priced against. The split is the target allocation's between the
// sleeves, so the plan holds stocks and bonds in the shares the rates
// were blended for, and the two cannot be set apart. There is nothing
// before a vintage or a curve is pulled, or while the vintage makes no
// blend, and what is missing is said.
export function derivedSet({
  cma,
  curve,
  deductions,
  mappings,
  targets,
}: {
  readonly cma: null | Vintages;
  readonly curve: Curve | null;
  readonly deductions: Deductions;
  readonly mappings: readonly Mapping[];
  readonly targets: null | Targets;
}): DerivedSet | Shortfall {
  if (cma === null) {
    return { short: "No CMA is pulled" };
  }
  const blends = blendsOf(cma.latest, targets, mappings);
  if ("short" in blends) {
    return blends;
  }
  if (curve === null) {
    return { short: "No inflation curve is pulled" };
  }
  return {
    allocation: { stocks: blends.stocks.share },
    rates: cmaRates(blends, deductions, inflationOf(curve).rate),
  };
}

// How far the two sleeves of a vintage's blends stray, and how they move
// together. BlackRock correlates each class only with government bonds
// and with equities, and those two with each other, so each class is
// read as moving with the two in the measure those correlations make,
// and two classes as moving together as far as what they share of the
// two does; a class moves wholly with itself, so a class two
// categories are mapped onto is blended as one. A sleeve's volatility
// is then its classes' in their weights, each pair as far as they move
// together, so classes that do not move wholly together stray less
// blended than on their own, and the correlation between the sleeves is
// what they share over what each strays, none where either strays by
// nothing, as an empty sleeve does. Correlations BlackRock rounds can
// disagree with each other past what any market could do, which would
// read as a sleeve straying by less than nothing or two sleeves moving
// together more than wholly, so a sleeve strays by nothing at the least
// and the two move together no more than wholly either way. There is none for a vintage pulled
// before volatilities were read, none of whose classes carries one,
// where a class blended carries none, or where the vintage does not say
// how bonds and equities move together, and what is missing is said:
// for the first, that, rather than every class it prices by name.
export function riskOf(
  cma: Cma,
  { bonds, stocks }: { readonly bonds: Blend; readonly stocks: Blend },
): Shortfall | SleeveRisk {
  if (cma.assets.every(({ risk }) => risk === undefined)) {
    return {
      short: `The ${vintageName(cma)} CMA was pulled before its volatilities were read`,
    };
  }
  const parts = [...stocks.parts, ...bonds.parts];
  const unrisked = parts.filter((part) => !isRisked(part));
  if (unrisked.length > 0) {
    const names = new Set(unrisked.map(({ asset }) => asset.name));
    return {
      short: `The ${vintageName(cma)} CMA gives ${listed.format(names)} no volatility`,
    };
  }
  const { correlation } = cma;
  if (correlation === undefined) {
    return {
      short: `The ${vintageName(cma)} CMA does not say how bonds and equities move together`,
    };
  }
  const covariance = (from: readonly Risked[], to: readonly Risked[]): number =>
    from
      .flatMap((first) =>
        to.map(
          (second) =>
            first.weight *
            second.weight *
            first.asset.risk.volatility *
            second.asset.risk.volatility *
            sharedBy(first, second, correlation),
        ),
      )
      .reduce((sum, part) => sum + part, 0);
  const inStocks = stocks.parts.filter(isRisked);
  const inBonds = bonds.parts.filter(isRisked);
  const strays = {
    bonds: Math.sqrt(Math.max(0, covariance(inBonds, inBonds))),
    stocks: Math.sqrt(Math.max(0, covariance(inStocks, inStocks))),
  };
  return {
    ...strays,
    correlation:
      strays.bonds === 0 || strays.stocks === 0
        ? 0
        : Math.min(
            1,
            Math.max(
              -1,
              covariance(inStocks, inBonds) / (strays.bonds * strays.stocks),
            ),
          ),
  };
}

// How far stocks' return in all moved from the previous vintage to the
// latest, under the target allocation and the mappings as they are now,
// so it is the move the new vintage made and nothing else; the fees and
// the yield come off both alike, so they are left out. None before a
// second vintage is pulled, while either makes no blend, or while
// nothing in the target allocation blends into stocks.
export function stocksMoved(
  { latest, previous }: Vintages,
  targets: null | Targets,
  mappings: readonly Mapping[],
): null | number {
  if (previous === null) {
    return null;
  }
  const now = blendsOf(latest, targets, mappings);
  const then = blendsOf(previous, targets, mappings);
  if ("short" in now || "short" in then || now.stocks.parts.length === 0) {
    return null;
  }
  return (
    now.stocks.rate +
    now.stocks.hedging -
    then.stocks.rate -
    then.stocks.hedging
  );
}

// A vintage by its month cut short and its year, as a figure names it,
// "Aug 2026".
export function vintageMonth({ vintage }: Cma): string {
  return `${monthName(vintage.month, "short")} ${String(vintage.year)}`;
}

// A vintage by its month and year, as BlackRock names it, "August 2026".
export function vintageName({ vintage }: Cma): string {
  return `${monthName(vintage.month, "long")} ${String(vintage.year)}`;
}

// A sleeve's blend of the categories in it, or none for a sleeve none
// is in.
function blendOf(
  priced: readonly Omit<Part, "weight">[],
  named: ReadonlyMap<string, Asset>,
): Blend | undefined {
  const share = priced.reduce((sum, { category }) => sum + category.share, 0);
  if (share === 0) {
    return undefined;
  }
  const parts = priced.map((part) => ({
    ...part,
    weight: part.category.share / share,
  }));
  const unhedged = ({ hedges, rate }: Asset): number =>
    named.get(hedges ?? "")?.rate ?? rate;
  return {
    hedging: parts.reduce(
      (sum, { asset, weight }) => sum + weight * (asset.rate - unhedged(asset)),
      0,
    ),
    parts,
    rate: parts.reduce(
      (sum, { asset, weight }) => sum + weight * unhedged(asset),
      0,
    ),
    share,
  };
}

// Whether a part's class carries how far it strays.
function isRisked(part: Part): part is Risked {
  return part.asset.risk !== undefined;
}

// How far two parts' classes move together: wholly for one class, and
// for two, as far as what each shares of government bonds and equities
// does, those two moving together by the correlation given. Each class
// is read as so much of each of the two, worked back from its
// correlations with them, and the measures of one class are met with
// the other's.
function sharedBy(first: Risked, second: Risked, correlation: number): number {
  if (first.asset === second.asset) {
    return 1;
  }
  const measuresOf = ({
    asset: { risk },
  }: Risked): { readonly bonds: number; readonly stocks: number } => ({
    bonds: (risk.bonds - correlation * risk.stocks) / (1 - correlation ** 2),
    stocks: (risk.stocks - correlation * risk.bonds) / (1 - correlation ** 2),
  });
  const one = measuresOf(first);
  const other = measuresOf(second);
  return (
    one.bonds * other.bonds +
    one.stocks * other.stocks +
    correlation * (one.bonds * other.stocks + one.stocks * other.bonds)
  );
}
