import { strToU8 } from "fflate";

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

// A whole number as a varint, a negative one widened to ten bytes as a
// negative int32 is written. For tests.
export function varintOf(value: number): Uint8Array<ArrayBuffer> {
  let left = BigInt.asUintN(64, BigInt(value));
  const bytes: number[] = [];
  do {
    const low = Number(left & 0x7fn);
    left >>= 7n;
    bytes.push(left === 0n ? low : low | 0x80);
  } while (left !== 0n);
  return new Uint8Array(bytes);
}

function bytesOf(value: string | Uint8Array | Written): Uint8Array {
  if (typeof value === "string") {
    return strToU8(value);
  }
  return value instanceof Uint8Array ? value : protobufOf(value);
}

function delimitedOf(number: number, bytes: Uint8Array): Uint8Array {
  return joined([varintOf(number * 8 + 2), varintOf(bytes.length), bytes]);
}

function joined(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const whole = new Uint8Array(
    parts.reduce((length, part) => length + part.length, 0),
  );
  let at = 0;
  for (const part of parts) {
    whole.set(part, at);
    at += part.length;
  }
  return whole;
}
