import { strFromU8 } from "fflate";

import { Refusal } from "@/lib/answer";

// A message as the protobuf wire writes it: each field's number to what
// was written under it, in the order written. A varint is read as the
// int32 it is in every field read here, and a length-delimited field as
// its bytes, which hold a string, a message or packed values as the
// schema says. A field of a fixed width is stepped over rather than
// kept, since nothing read here is one.
export type Message = ReadonlyMap<number, readonly Value[]>;

type Value = number | Uint8Array;

// The wire types a field is written in, as its key's lowest three bits
// give them. The group types between them are proto2's, long
// deprecated, and are refused rather than stepped over.
const varint = 0;
const fixed64 = 1;
const delimited = 2;
const fixed32 = 5;

// The longest a varint is written, a negative int32 being widened to
// ten bytes as a negative int64 is.
const longest = 10;

const cutShort = "The data is cut short partway through a field";

// The int32 written last under a number, or nought when none was, since
// proto3 leaves a nought unwritten and a field written twice holds the
// later.
export function int32At(message: Message, number: number): number {
  const value = message.get(number)?.at(-1);
  if (value === undefined) {
    return 0;
  }
  if (typeof value !== "number") {
    throw new Refusal(
      `The data holds bytes where field ${String(number)}'s number is read`,
    );
  }
  return value;
}

// The fields of a message, read off its bytes. A field of a type the
// wire does not write, or one running past the end of the bytes, is
// refused, since either is a file read wrongly or no protobuf at all.
export function messageOf(bytes: Uint8Array): Message {
  const fields = new Map<number, Value[]>();
  let at = 0;
  while (at < bytes.length) {
    const [key, afterKey] = varintAt(bytes, at);
    const [value, after] = valueAt(bytes, afterKey, key & 7);
    at = after;
    if (value !== undefined) {
      const number = key >>> 3;
      const written = fields.get(number);
      if (written === undefined) {
        fields.set(number, [value]);
      } else {
        written.push(value);
      }
    }
  }
  return fields;
}

// The messages written under a number, each read as one, in the order
// written, as a repeated field holds them.
export function messagesAt(
  message: Message,
  number: number,
): readonly Message[] {
  return (message.get(number) ?? []).map((value) =>
    messageOf(bytesOf(value, number)),
  );
}

// The string written last under a number, or nothing when none was,
// which proto3 says of an optional string never set and of an empty one
// alike.
export function textAt(message: Message, number: number): string | undefined {
  const value = message.get(number)?.at(-1);
  return value === undefined ? undefined : strFromU8(bytesOf(value, number));
}

function bytesOf(value: Value, number: number): Uint8Array {
  if (typeof value === "number") {
    throw new Refusal(
      `The data holds a number where field ${String(number)}'s bytes are read`,
    );
  }
  return value;
}

// What a field of the wire type given holds, from where its key ends,
// and where the next field starts: a varint's value, a length-delimited
// field's bytes, or nothing for a fixed-width field stepped over.
function valueAt(
  bytes: Uint8Array,
  at: number,
  wireType: number,
): readonly [undefined | Value, number] {
  switch (wireType) {
    case delimited: {
      const [length, start] = varintAt(bytes, at);
      const end = within(bytes, start, length);
      return [bytes.subarray(start, end), end];
    }
    case fixed32:
      return [undefined, within(bytes, at, 4)];
    case fixed64:
      return [undefined, within(bytes, at, 8)];
    case varint:
      return varintAt(bytes, at);
    default:
      throw new Refusal(
        `The data has a field of wire type ${String(wireType)}, which proto3 does not write`,
      );
  }
}

// The varint starting at a place in the bytes, as the low 32 bits it
// carries read signed, which is the int32 it is, and the place after
// it. Bits past the 32nd are those a negative int32 is widened with,
// so the bytes carrying only them are stepped over.
function varintAt(bytes: Uint8Array, at: number): readonly [number, number] {
  let value = 0;
  for (let read = 0; read < longest; read++) {
    const byte = bytes[at + read];
    if (byte === undefined) {
      throw new Refusal(cutShort);
    }
    if (read < 5) {
      value |= (byte & 0x7f) << (7 * read);
    }
    if (byte < 0x80) {
      return [value, at + read + 1];
    }
  }
  throw new Refusal(
    `The data holds a varint longer than ${String(longest)} bytes`,
  );
}

// Where a stretch of the length given, from a place in the bytes, ends,
// or a refusal when the bytes end first, as they do for a length read
// as a negative int32.
function within(bytes: Uint8Array, at: number, length: number): number {
  const end = at + length;
  if (length < 0 || end > bytes.length) {
    throw new Refusal(cutShort);
  }
  return end;
}
