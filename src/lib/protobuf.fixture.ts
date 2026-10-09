import { strToU8 } from "fflate";

import { delimitedOf, joined, varintOf } from "@/lib/protobuf";

// A message as a test writes it: its fields in order, each its number
// and what it holds, a whole number written as a varint, text and bytes
// length-delimited, and a message's fields nested as one.
export type Written = readonly (readonly [number, Field])[];

type Field = number | string | Uint8Array | Written;

// The bytes of a message written as protobuf writes it. For tests.
export function protobufOf(fields: Written): Uint8Array<ArrayBuffer> {
  return joined(
    fields.map(([number, value]) =>
      typeof value === "number"
        ? joined([varintOf(number * 8), varintOf(value)])
        : delimitedOf(number, bytesOf(value)),
    ),
  );
}

function bytesOf(value: string | Uint8Array | Written): Uint8Array {
  if (typeof value === "string") {
    return strToU8(value);
  }
  return value instanceof Uint8Array ? value : protobufOf(value);
}
