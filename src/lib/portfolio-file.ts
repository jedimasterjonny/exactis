import type { Unzipped } from "fflate";

import { strToU8, zipSync } from "fflate";

import type { Target } from "@/data/targets";
import type { Message } from "@/lib/protobuf";

import { Refusal } from "@/lib/answer";
import { sumOf } from "@/lib/ledger";
import { formatPercent } from "@/lib/money";
import {
  int32At,
  int64At,
  joined,
  messageOf,
  messagesAt,
  textAt,
  withMessagesAt,
  withWholeAt,
} from "@/lib/protobuf";
import { unzipped } from "@/lib/workbook";

// A holding assigned to a class as the file gives it: the id of the
// vehicle, a security or an account, and how much of the holding the
// class takes, in hundredths of a per cent, since a holding may be
// split between classes.
interface Assignment {
  readonly vehicle: string;
  readonly weight: number;
}

// A class of the taxonomy as the file gives it: its id, the id of the
// class it sits beneath, which only the taxonomy's root has none of,
// its name, its weight of its parent, its place among the classes
// beside it, and the holdings assigned to it.
interface Class {
  readonly assignments: readonly Assignment[];
  readonly id: string;
  readonly name: string;
  readonly parent: string | undefined;
  readonly rank: number;
  readonly weight: number;
}

// A file opened: the parts of the zip, and the client's protobuf behind
// the signature.
interface Opened {
  readonly client: Uint8Array;
  readonly parts: Unzipped;
}

// A security as the file prices it: its name, the currency it is
// priced in, or that it is priced in none, and its last price in that
// currency, or nothing while the file holds no price for it.
interface Security {
  readonly currency: string;
  readonly name: string;
  readonly price: number;
}

// A taxonomy's classes as the tree from its root: the root, and the
// classes beneath any class, in the order Portfolio Performance ranks
// them.
interface Tree {
  readonly beneath: (above: Class) => readonly Class[];
  readonly root: Class;
}

// The taxonomy the target allocation is read from, as tradey reads it.
export const taxonomy = "Asset Allocation";

// What Portfolio Performance writes ahead of the protobuf in a file
// saved in binary, and the part of the zip it writes both to.
const signature = "PPPBV1";
const part = "data.portfolio";

// What Portfolio Performance writes at the head of a file it saves with
// a password, at the head of one it saves as XML, and the part of the
// zip it writes XML to when it compresses it.
const encrypted = "PORTFOLIO";
const xml = "<";
const xmlPart = "data.xml";

// Why a file saved as XML, compressed or not, is refused.
const savedAsXml =
  "The file is saved as XML, and only a Portfolio Performance file saved in binary can be read";

// A class's weight of the whole of its parent, and a holding's of the
// whole of itself, as Portfolio Performance writes a weight: in
// hundredths of a per cent.
const whole = 10_000;

// How far shares given to write may add up from the whole: nothing but
// the rounding of the arithmetic that made them, as the household
// holds the targets.
const tolerance = 1e-9;

// What a count of shares and a price are both written in:
// hundred-millionths.
const scaled = 1e8;

// What a pound is in each currency the reader prices on its own,
// sterling and pence. Any other is priced at a rate read off the file's
// transactions, or refused by name when none gives one, rather than
// priced wrongly or at nothing.
const factors: ReadonlyMap<string, number> = new Map([
  ["GBP", 1],
  ["GBX", 0.01],
]);

// What a transaction of each type does to what is held of its
// security: a purchase or a delivery in adds its shares, a sale or a
// delivery out takes them off, and the rest, a dividend or a fee,
// moves none, so is not listed.
const signs: ReadonlyMap<number, -1 | 1> = new Map([
  [0, 1],
  [1, -1],
  [2, 1],
  [3, -1],
]);

// The fields read, by their numbers in Portfolio Performance's
// client.proto: the client's securities, transactions and taxonomies,
// a security's id, name, currency and prices, a price's close, a
// transaction's type, date, currency, shares, security and units, a
// timestamp's seconds, a unit's amount and the same in the currency
// it was carried from, a taxonomy's name and classes, what a class
// holds, and a holding's vehicle and weight.
const fields = {
  assignment: { vehicle: 1, weight: 2 },
  class: { assignments: 9, id: 1, name: 3, parent: 2, rank: 7, weight: 6 },
  client: { securities: 2, taxonomies: 8, transactions: 5 },
  price: { close: 2 },
  security: { currency: 4, id: 1, name: 3, prices: 13 },
  taxonomy: { classes: 5, name: 2 },
  timestamp: { seconds: 1 },
  transaction: {
    currency: 10,
    date: 9,
    security: 14,
    shares: 12,
    type: 2,
    units: 15,
  },
  unit: { amount: 2, fxAmount: 4, fxCurrency: 5 },
} as const;

// The target allocation a Portfolio Performance file holds, from its
// Asset Allocation taxonomy, and what each category of it holds. The
// file is the one Portfolio Performance saves in binary: a zip holding
// one part, the protobuf of the whole client behind a signature. The
// taxonomy is read out of it, and beside it the securities and the
// transactions, to say what each category holds; nothing else the
// client holds, its accounts among them, is opened. Each class with
// none beneath it is a category, and its share of the whole is its
// weight times the weight of every class above it, the root's aside,
// since the root is the whole. What it holds is each security assigned
// to it, what is held of the security summed from the transactions,
// bought and delivered in less sold and delivered out, at the last
// price the file holds for it, by the weight of the holding the class
// takes, to the whole pound. A price in sterling or in pence is a
// pound's worth as it is, and one in any other currency is carried
// into pounds at the rate the file's latest transaction in pounds
// carrying that currency was made at, which is as old as that
// transaction; a security held in a currency no transaction gives a
// rate for is refused by name, since the reader cannot price it and
// the file leaves nothing on the network to ask. An account assigned
// to a category is worth nothing to the reader, which does not open
// the accounts, as is a security the file holds no price for. The
// classes at the top are read in the order Portfolio Performance ranks
// them, each with its categories together beneath it, the largest
// share first and a tie in the taxonomy's order. Whether the shares
// add up to the whole is the household's to hold, not the file's. What
// the reader cannot read, or cannot find, is refused in words naming
// it, since the screen says why a file was not imported. A file
// Portfolio Performance saved some other way, with a password or as
// XML, compressed or not, is known by how it opens, as Portfolio
// Performance knows it, and refused in words saying how it was saved,
// since saving it again in binary is what makes it read.
export function readTargets(file: Uint8Array): readonly Target[] {
  const client = messageOf(opened(file).client);
  return targetsOf(classesIn(client), worthOf(client));
}

// The file with its Asset Allocation taxonomy's weights set so that
// each category holds the share of the whole given for it, by its id,
// and everything else in the file as it was, byte for byte: the other
// taxonomies, the holdings, the transactions, and the taxonomy's own
// classes, names and assignments. A class's weight is of its parent,
// so the share of a class with classes beneath it is theirs added up,
// and each class is weighted by its share over its parent's, the
// classes beneath one parent rounded to add up to the whole of it, the
// odd hundredths of a per cent given one each to the largest
// remainders; so the shares read back out of the file add up to the
// whole. Shares given that do not add up to the whole are refused
// saying what they add up to, since weighting each by its parent's
// would scale them to the whole without a word, and the household's
// check that the targets add up could then never fire. Beneath a class
// holding nothing every class weighs nothing, and a category given no
// share holds none. The root's weight is left as written, since the
// root is the whole. The file is opened as it is read, and refused as
// it is read, so a file that could not be read is not written either.
export function reweighted(
  file: Uint8Array,
  shares: ReadonlyMap<string, number>,
): Uint8Array<ArrayBuffer> {
  const { client, parts } = opened(file);
  const total = sumOf([...shares.values()], (share) => share);
  if (Math.abs(total - 1) > tolerance) {
    throw new Refusal(
      `The shares given add up to ${formatPercent(total)} rather than 100%`,
    );
  }
  const weights = weightsOf(classesIn(messageOf(client)), shares);
  const rewritten = withMessagesAt(
    client,
    fields.client.taxonomies,
    (written) =>
      textAt(messageOf(written), fields.taxonomy.name) === taxonomy
        ? withMessagesAt(written, fields.taxonomy.classes, (each) => {
            const weight = weights.get(
              textOf(messageOf(each), fields.class.id),
            );
            return weight === undefined
              ? each
              : withWholeAt(each, fields.class.weight, weight);
          })
        : written,
  );
  return new Uint8Array(
    zipSync({ ...parts, [part]: joined([strToU8(signature), rewritten]) }),
  );
}

// The classes of the client's Asset Allocation taxonomy, as written,
// or a refusal naming the taxonomies it has instead.
function classesIn(client: Message): readonly Class[] {
  const taxonomies = messagesAt(client, fields.client.taxonomies);
  const found = taxonomies.find(
    (each) => textAt(each, fields.taxonomy.name) === taxonomy,
  );
  if (found === undefined) {
    throw new Refusal(
      `The file has no ${taxonomy} taxonomy, only ${listed(taxonomies)}`,
    );
  }
  return messagesAt(found, fields.taxonomy.classes).map(classOf);
}

function classOf(message: Message): Class {
  return {
    assignments: messagesAt(message, fields.class.assignments).map((each) => ({
      vehicle: textOf(each, fields.assignment.vehicle),
      weight: int32At(each, fields.assignment.weight),
    })),
    id: textOf(message, fields.class.id),
    name: textOf(message, fields.class.name),
    parent: textAt(message, fields.class.parent),
    rank: int32At(message, fields.class.rank),
    weight: int32At(message, fields.class.weight),
  };
}

// When a transaction was made, in seconds since the epoch as Portfolio
// Performance writes a timestamp, or nought for one with no date.
function dateOf(transaction: Message): number {
  const [date] = messagesAt(transaction, fields.transaction.date);
  return date === undefined ? 0 : int64At(date, fields.timestamp.seconds);
}

// Fractions of a whole as hundredths of a per cent that add up to the
// whole of what the fractions add up to: each rounded down, and the
// hundredths left over given one each to the largest remainders, in
// order, so fractions adding up to one add up to the whole, and
// fractions of nothing stay nothing.
function hundredthsOf(
  fractions: ReadonlyMap<string, number>,
): ReadonlyMap<string, number> {
  const entries = [...fractions];
  const down = (fraction: number): number => Math.floor(fraction * whole);
  const left =
    Math.round(sumOf(entries, ([, fraction]) => fraction) * whole) -
    sumOf(entries, ([, fraction]) => down(fraction));
  const bumped = new Set(
    entries
      .map(([id, fraction]) => [id, fraction * whole - down(fraction)] as const)
      .toSorted(([, one], [, other]) => other - one)
      .slice(0, left)
      .map(([id]) => id),
  );
  return new Map(
    entries.map(([id, fraction]) => [
      id,
      down(fraction) + (bumped.has(id) ? 1 : 0),
    ]),
  );
}

// The names of the taxonomies with one, as a sentence lists them, or
// none.
function listed(taxonomies: readonly Message[]): string {
  const names = taxonomies.flatMap(
    (each) => textAt(each, fields.taxonomy.name) ?? [],
  );
  return names.length === 0 ? "none" : names.join(", ");
}

// The file opened, as Portfolio Performance knows a file it saved in
// binary: a zip holding the client's protobuf behind the signature. A
// file saved some other way, with a password or as XML, compressed or
// not, is known by how it opens and refused in words saying how it was
// saved, since saving it again in binary is what makes it read.
function opened(file: Uint8Array): Opened {
  if (opensWith(file, encrypted)) {
    throw new Refusal(
      "The file is encrypted, and only a Portfolio Performance file saved in binary without a password can be read",
    );
  }
  if (opensWith(file, xml)) {
    throw new Refusal(savedAsXml);
  }
  const parts = unzipped(
    file,
    "The file is not a zip, as a Portfolio Performance file saved in binary is",
  );
  const data = parts[part];
  if (data === undefined) {
    throw new Refusal(
      parts[xmlPart] === undefined ? `The file holds no ${part}` : savedAsXml,
    );
  }
  if (!opensWith(data, signature)) {
    throw new Refusal(
      "The file is not in Portfolio Performance's binary format",
    );
  }
  return { client: data.subarray(signature.length), parts };
}

// Whether the bytes open with the text given, written as UTF-8 as
// every signature read here is.
function opensWith(bytes: Uint8Array, text: string): boolean {
  return strToU8(text).every((byte, at) => bytes[at] === byte);
}

// What a pound is in each currency the file gives a rate for, beside
// sterling and pence. Portfolio Performance writes a transaction made
// in pounds on a security priced in another currency with its gross
// value, and a fee or a tax in that currency, in both: the pounds over
// the other is the rate the transaction was made at. The file holds no
// rate of the day, so the latest transaction's is taken, by date rather
// than by the order written, since the file writes them in neither. A
// transaction made in some other currency is not read, since its rate
// is to that currency rather than the pound, and a unit worth nothing
// in the other currency gives no rate.
function poundsPer(client: Message): ReadonlyMap<string, number> {
  const rates = new Map<string, number>();
  const dated = messagesAt(client, fields.client.transactions)
    .filter((each) => textAt(each, fields.transaction.currency) === "GBP")
    .map((each) => [dateOf(each), each] as const)
    .toSorted(([one], [other]) => one - other);
  for (const [, transaction] of dated) {
    for (const unit of messagesAt(transaction, fields.transaction.units)) {
      const currency = textAt(unit, fields.unit.fxCurrency);
      const foreign = int64At(unit, fields.unit.fxAmount);
      if (currency !== undefined && foreign > 0) {
        rates.set(currency, int64At(unit, fields.unit.amount) / foreign);
      }
    }
  }
  return new Map([...rates, ...factors]);
}

// The securities the file holds, by id, each as it is priced.
function securitiesOf(client: Message): ReadonlyMap<string, Security> {
  return new Map(
    messagesAt(client, fields.client.securities).map((security) => {
      const last = messagesAt(security, fields.security.prices).at(-1);
      return [
        textOf(security, fields.security.id),
        {
          currency: textAt(security, fields.security.currency) ?? "no currency",
          name: textOf(security, fields.security.name),
          price:
            last === undefined ? 0 : int64At(last, fields.price.close) / scaled,
        },
      ];
    }),
  );
}

// What is held of each security, by id, summed from the transactions
// as the signs take them, in hundred-millionths of a share as they are
// written. A transaction on no security, a deposit or a removal, holds
// none.
function sharesHeld(client: Message): ReadonlyMap<string, number> {
  const held = new Map<string, number>();
  for (const transaction of messagesAt(client, fields.client.transactions)) {
    const security = textAt(transaction, fields.transaction.security);
    const sign = signs.get(int32At(transaction, fields.transaction.type));
    if (security !== undefined && sign !== undefined) {
      held.set(
        security,
        (held.get(security) ?? 0) +
          sign * int64At(transaction, fields.transaction.shares),
      );
    }
  }
  return held;
}

// The categories of a taxonomy's classes, from its root down, each
// worth what the holdings assigned to it come to. A category with no
// name, which the household keeps none of, is refused in words saying
// where it sits.
function targetsOf(
  classes: readonly Class[],
  worth: (assignments: readonly Assignment[]) => number,
): readonly Target[] {
  const { beneath, root } = treeOf(classes);
  const categoriesOf = (
    of: Class,
    above: readonly string[],
    share: number,
  ): readonly Target[] => {
    const within = (share * of.weight) / whole;
    const below = beneath(of);
    if (below.length === 0 && of.name.trim() === "") {
      throw new Refusal(
        `The ${taxonomy} taxonomy has a category with no name beneath ${above.length === 0 ? "its root" : above.join(" · ")}`,
      );
    }
    return below.length === 0
      ? [
          {
            classes: above,
            id: of.id,
            isImplemented: of.assignments.length > 0,
            name: of.name,
            share: within,
            value: worth(of.assignments),
          },
        ]
      : below.flatMap((each) =>
          categoriesOf(each, [...above, of.name], within),
        );
  };
  return beneath(root).flatMap((each) =>
    categoriesOf(each, [], 1).toSorted((one, other) => other.share - one.share),
  );
}

// The text written under a number, or nothing where none was, as an id
// or a name the file leaves out reads.
function textOf(message: Message, number: number): string {
  return textAt(message, number) ?? "";
}

// A taxonomy's classes as the tree from its root. A class with no id
// is refused, and so is one listed twice, since either would leave the
// taxonomy no single tree to read, as are a taxonomy with no root and
// one with no class beneath it. A class beneath none the taxonomy lists
// is part of no tree from its root, so is not read.
function treeOf(classes: readonly Class[]): Tree {
  if (classes.some(({ id }) => id === "")) {
    throw new Refusal(`The ${taxonomy} taxonomy has a class with no id`);
  }
  if (new Set(classes.map(({ id }) => id)).size !== classes.length) {
    throw new Refusal(`The ${taxonomy} taxonomy lists a class twice`);
  }
  const root = classes.find(({ parent }) => parent === undefined);
  if (root === undefined) {
    throw new Refusal(`The ${taxonomy} taxonomy has no root`);
  }
  const beneath = (above: Class): readonly Class[] =>
    classes
      .filter(({ parent }) => parent === above.id)
      .sort((one, other) => one.rank - other.rank);
  if (beneath(root).length === 0) {
    throw new Refusal(`The ${taxonomy} taxonomy holds no classes`);
  }
  return { beneath, root };
}

// The weight of every class beneath the root, by its id, for the
// categories to hold the shares of the whole given: each class's share
// is its category's, or those of the classes beneath it added up, and
// its weight is its share over its parent's in hundredths of a per
// cent, the classes beneath one parent rounded to add up to the whole
// of it, and all nothing beneath a parent holding nothing.
function weightsOf(
  classes: readonly Class[],
  shares: ReadonlyMap<string, number>,
): ReadonlyMap<string, number> {
  const { beneath, root } = treeOf(classes);
  const shareOf = (of: Class): number => {
    const below = beneath(of);
    return below.length === 0
      ? (shares.get(of.id) ?? 0)
      : sumOf(below, shareOf);
  };
  const weights = new Map<string, number>();
  const weigh = (above: Class): void => {
    const below = beneath(above);
    const held = shareOf(above);
    const rounded = hundredthsOf(
      new Map(
        below.map((each) => [each.id, held === 0 ? 0 : shareOf(each) / held]),
      ),
    );
    for (const [id, weight] of rounded) {
      weights.set(id, weight);
    }
    below.forEach(weigh);
  };
  weigh(root);
  return weights;
}

// What holdings assigned to a class come to, in whole pounds, read off
// the client's securities and transactions: each security held, at its
// last price in pounds, by the weight of it the class takes. A vehicle
// the securities do not list, an account, and a security of which
// nothing is held, count for nothing; one held but priced in a currency
// the reader has no pound for is refused by name.
function worthOf(
  client: Message,
): (assignments: readonly Assignment[]) => number {
  const securities = securitiesOf(client);
  const held = sharesHeld(client);
  const pounds = poundsPer(client);
  return (assignments) =>
    Math.round(
      assignments.reduce((sum, { vehicle, weight }) => {
        // ponytail: an account assigned to a category, as a cash one
        // is, is worth nothing here; sum its transactions when a cash
        // target is to be bought toward.
        const security = securities.get(vehicle);
        const shares = (held.get(vehicle) ?? 0) / scaled;
        if (security === undefined || shares <= 0) {
          return sum;
        }
        const factor = pounds.get(security.currency);
        if (factor === undefined) {
          throw new Refusal(
            `The file holds ${security.name}, priced in ${security.currency}, and no transaction in pounds gives a rate for it`,
          );
        }
        return sum + (shares * security.price * factor * weight) / whole;
      }, 0),
    );
}
