import { strToU8 } from "fflate";

import type { Target } from "@/data/targets";
import type { Message } from "@/lib/protobuf";

import { Refusal } from "@/lib/answer";
import {
  int32At,
  int64At,
  messageOf,
  messagesAt,
  textAt,
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

// A security as the file prices it: its name, the currency it is
// priced in, or that it is priced in none, and its last price in that
// currency, or nothing while the file holds no price for it.
interface Security {
  readonly currency: string;
  readonly name: string;
  readonly price: number;
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

// What a count of shares and a price are both written in:
// hundred-millionths.
const scaled = 1e8;

// What a pound is in each currency the reader prices, sterling and
// pence. A security held in any other is refused by name rather than
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
// transaction's type, shares and security, a taxonomy's name and
// classes, what a class holds, and a holding's vehicle and weight.
const fields = {
  assignment: { vehicle: 1, weight: 2 },
  class: { assignments: 9, id: 1, name: 3, parent: 2, rank: 7, weight: 6 },
  client: { securities: 2, taxonomies: 8, transactions: 5 },
  price: { close: 2 },
  security: { currency: 4, id: 1, name: 3, prices: 13 },
  taxonomy: { classes: 5, name: 2 },
  transaction: { security: 14, shares: 12, type: 2 },
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
// price the file holds for it, in sterling or in pence, by the weight
// of the holding the class takes, to the whole pound; a security held
// in any other currency is refused by name, since the reader cannot
// price it. An account assigned to a category is worth nothing to the
// reader, which does not open the accounts, as is a security the file
// holds no price for. The classes at the top are read in the order
// Portfolio Performance ranks them, each with its categories together
// beneath it, the largest share first and a tie in the taxonomy's
// order. Whether the shares add up to the whole is the household's to
// hold, not the file's. What the reader cannot read, or cannot find,
// is refused in words naming it, since the screen says why a file was
// not imported. A file Portfolio Performance saved some other way,
// with a password or as XML, compressed or not, is known by how it
// opens, as Portfolio Performance knows it, and refused in words saying
// how it was saved, since saving it again in binary is what makes it
// read.
export function readTargets(file: Uint8Array): readonly Target[] {
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
  const client = messageOf(data.subarray(signature.length));
  const taxonomies = messagesAt(client, fields.client.taxonomies);
  const found = taxonomies.find(
    (each) => textAt(each, fields.taxonomy.name) === taxonomy,
  );
  if (found === undefined) {
    throw new Refusal(
      `The file has no ${taxonomy} taxonomy, only ${listed(taxonomies)}`,
    );
  }
  return targetsOf(
    messagesAt(found, fields.taxonomy.classes).map(classOf),
    worthOf(client),
  );
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

// The names of the taxonomies with one, as a sentence lists them, or
// none.
function listed(taxonomies: readonly Message[]): string {
  const names = taxonomies.flatMap(
    (each) => textAt(each, fields.taxonomy.name) ?? [],
  );
  return names.length === 0 ? "none" : names.join(", ");
}

// Whether the bytes open with the text given, written as UTF-8 as
// every signature read here is.
function opensWith(bytes: Uint8Array, text: string): boolean {
  return strToU8(text).every((byte, at) => bytes[at] === byte);
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
// worth what the holdings assigned to it come to. A class with no id is
// refused, and so is one listed twice, since either would leave the
// taxonomy no single tree to read, and a category with no name, which
// the household keeps none of, in words saying where it sits. A class
// beneath none the taxonomy lists is part of no tree from its root, so
// is not read.
function targetsOf(
  classes: readonly Class[],
  worth: (assignments: readonly Assignment[]) => number,
): readonly Target[] {
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
  const top = beneath(root);
  if (top.length === 0) {
    throw new Refusal(`The ${taxonomy} taxonomy holds no classes`);
  }
  return top.flatMap((each) =>
    categoriesOf(each, [], 1).toSorted((one, other) => other.share - one.share),
  );
}

// The text written under a number, or nothing where none was, as an id
// or a name the file leaves out reads.
function textOf(message: Message, number: number): string {
  return textAt(message, number) ?? "";
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
        const factor = factors.get(security.currency);
        if (factor === undefined) {
          throw new Refusal(
            `The file holds ${security.name}, priced in ${security.currency}, and only GBP and GBX are read`,
          );
        }
        return sum + (shares * security.price * factor * weight) / whole;
      }, 0),
    );
}
