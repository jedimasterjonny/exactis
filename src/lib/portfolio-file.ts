import { strToU8 } from "fflate";

import type { Target } from "@/data/targets";
import type { Message } from "@/lib/protobuf";

import { Refusal } from "@/lib/answer";
import { int32At, messageOf, messagesAt, textAt } from "@/lib/protobuf";
import { unzipped } from "@/lib/workbook";

// A class of the taxonomy as the file gives it: its id, the id of the
// class it sits beneath, which only the taxonomy's root has none of,
// its name, its weight of its parent, its place among the classes
// beside it, and whether any holding is assigned to it.
interface Class {
  readonly id: string;
  readonly isAssigned: boolean;
  readonly name: string;
  readonly parent: string | undefined;
  readonly rank: number;
  readonly weight: number;
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

// A class's weight of the whole of its parent, as Portfolio Performance
// writes a weight: in hundredths of a per cent.
const whole = 10_000;

// The fields read, by their numbers in Portfolio Performance's
// client.proto: the client's taxonomies, a taxonomy's name and classes,
// and what a class holds.
const fields = {
  class: { assignments: 9, id: 1, name: 3, parent: 2, rank: 7, weight: 6 },
  client: { taxonomies: 8 },
  taxonomy: { classes: 5, name: 2 },
} as const;

// The target allocation a Portfolio Performance file holds, from its
// Asset Allocation taxonomy. The file is the one Portfolio Performance
// saves in binary: a zip holding one part, the protobuf of the whole
// client behind a signature. Only the taxonomy is read out of it, and
// nothing else the client holds, its holdings, their prices or its
// transactions, is opened. Each class with none beneath it is a
// category, and its share of the whole is its weight times the weight
// of every class above it, the root's aside, since the root is the
// whole. The classes at the top are read in the order Portfolio
// Performance ranks them, each with its categories together beneath
// it, the largest share first and a tie in the taxonomy's order.
// Whether the shares add up to the whole is the household's to hold,
// not the file's. What the reader cannot read, or cannot find, is
// refused in words naming it, since the screen says why a file was not
// imported. A file Portfolio Performance saved some other way, with a
// password or as XML, compressed or not, is known by how it opens, as
// Portfolio Performance knows it, and refused in words saying how it
// was saved, since saving it again in binary is what makes it read.
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
  const taxonomies = messagesAt(
    messageOf(data.subarray(signature.length)),
    fields.client.taxonomies,
  );
  const found = taxonomies.find(
    (each) => textAt(each, fields.taxonomy.name) === taxonomy,
  );
  if (found === undefined) {
    throw new Refusal(
      `The file has no ${taxonomy} taxonomy, only ${listed(taxonomies)}`,
    );
  }
  return targetsOf(messagesAt(found, fields.taxonomy.classes).map(classOf));
}

function classOf(message: Message): Class {
  return {
    id: textAt(message, fields.class.id) ?? "",
    isAssigned: message.has(fields.class.assignments),
    name: textAt(message, fields.class.name) ?? "",
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

// The categories of a taxonomy's classes, from its root down. A class
// with no id is refused, and so is one listed twice, since either would
// leave the taxonomy no single tree to read, and a category with no
// name, which the household keeps none of, in words saying where it
// sits. A class beneath none the taxonomy lists is part of no tree from
// its root, so is not read.
function targetsOf(classes: readonly Class[]): readonly Target[] {
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
            isImplemented: of.isAssigned,
            name: of.name,
            share: within,
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
    [...categoriesOf(each, [], 1)].sort(
      (one, other) => other.share - one.share,
    ),
  );
}
