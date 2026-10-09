import { strFromU8 } from "fflate";

import { Refusal } from "@/lib/answer";

// A message as the protobuf wire writes it: each field's number to what
// was written under it, in the order written. A varint is read whole,
// as the int32 or int64 the field is read back as, and a
// length-delimited field as its bytes, which hold a string, a message
// or packed values as the schema says. A field of a fixed width is
// stepped over rather than kept, since nothing read here is one.
export type Message = ReadonlyMap<number, readonly Value[]>;

// A field as it lies in the bytes: its number, where it starts and
// where the next begins, and what it holds, which is nothing for a
// field of a fixed width.
interface Field {
  readonly from: number;
  readonly number: number;
  readonly to: number;
  readonly value: undefined | Value;
}

type Value = bigint | Uint8Array;

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

// Bytes written under a number as a length-delimited field: its key,
// how long they are and the bytes.
export function delimitedOf(number: number, bytes: Uint8Array): Uint8Array {
  return joined([varintOf(number * 8 + 2), varintOf(bytes.length), bytes]);
}

// The int32 written last under a number, or nought when none was, since
// proto3 leaves a nought unwritten and a field written twice holds the
// later.
export function int32At(message: Message, number: number): number {
  return Number(BigInt.asIntN(32, wholeAt(message, number)));
}

// The int64 written last under a number, or nought when none was, as
// int32At reads one. Read as a number, which is exact to 2^53, as every
// int64 read here, a count of shares or a price in hundred-millionths,
// is within.
export function int64At(message: Message, number: number): number {
  return Number(BigInt.asIntN(64, wholeAt(message, number)));
}

// The parts as one, as a message is written from its fields.
export function joined(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
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

// The fields of a message, read off its bytes. A field of a type the
// wire does not write, or one running past the end of the bytes, is
// refused, since either is a file read wrongly or no protobuf at all.
export function messageOf(bytes: Uint8Array): Message {
  const fields = new Map<number, Value[]>();
  for (const { number, value } of fieldsOf(bytes)) {
    if (value !== undefined) {
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

// A whole number as a varint, a negative one widened to ten bytes as a
// negative int32 is written.
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

// The message with each message written under a number rewritten as
// the edit makes it, and every other field kept byte for byte as it was
// written, wherever it was. What was written under the number is
// refused where it is no message.
export function withMessagesAt(
  bytes: Uint8Array,
  number: number,
  edit: (message: Uint8Array) => Uint8Array,
): Uint8Array {
  return joined(
    [...fieldsOf(bytes)].map((field) =>
      field.number === number
        ? delimitedOf(number, edit(bytesOf(field.value, number)))
        : bytes.subarray(field.from, field.to),
    ),
  );
}

// The message with the whole number given written under a number, in
// the place of the first field written there and over any other, or at
// the end where none was; and with none written there for a nought, as
// proto3 leaves a nought unwritten. Every other field is kept byte for
// byte as it was written.
export function withWholeAt(
  bytes: Uint8Array,
  number: number,
  value: number,
): Uint8Array {
  const written = value === 0 ? [] : [varintOf(number * 8), varintOf(value)];
  const parts: Uint8Array[] = [];
  let isPlaced = false;
  for (const field of fieldsOf(bytes)) {
    if (field.number !== number) {
      parts.push(bytes.subarray(field.from, field.to));
    } else if (!isPlaced) {
      parts.push(...written);
      isPlaced = true;
    }
  }
  return joined(isPlaced ? parts : [...parts, ...written]);
}

function bytesOf(value: undefined | Value, number: number): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new Refusal(
      `The data holds a number where field ${String(number)}'s bytes are read`,
    );
  }
  return value;
}

// The fields of a message as they lie in its bytes, one after another.
function* fieldsOf(bytes: Uint8Array): Generator<Field> {
  let at = 0;
  while (at < bytes.length) {
    const [key, afterKey] = varintAt(bytes, at);
    const [value, to] = valueAt(bytes, afterKey, Number(key & 7n));
    yield { from: at, number: Number(key >> 3n), to, value };
    at = to;
  }
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
      const end = within(bytes, start, Number(length));
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

// The varint starting at a place in the bytes, whole and unsigned as
// the wire writes it, which the reader of the field makes the int32 or
// int64 it is, and the place after it.
function varintAt(bytes: Uint8Array, at: number): readonly [bigint, number] {
  let value = 0n;
  for (let read = 0; read < longest; read++) {
    const byte = bytes[at + read];
    if (byte === undefined) {
      throw new Refusal(cutShort);
    }
    value |= BigInt(byte & 0x7f) << BigInt(7 * read);
    if (byte < 0x80) {
      return [value, at + read + 1];
    }
  }
  throw new Refusal(
    `The data holds a varint longer than ${String(longest)} bytes`,
  );
}

// The whole number written last under a number, or nought when none
// was, since proto3 leaves a nought unwritten and a field written twice
// holds the later.
function wholeAt(message: Message, number: number): bigint {
  const value = message.get(number)?.at(-1);
  if (value === undefined) {
    return 0n;
  }
  if (typeof value !== "bigint") {
    throw new Refusal(
      `The data holds bytes where field ${String(number)}'s number is read`,
    );
  }
  return value;
}

// Where a stretch of the length given, from a place in the bytes, ends,
// or a refusal when the bytes end first, as they do for a length
// written as a negative number, which the wire widens past any file.
function within(bytes: Uint8Array, at: number, length: number): number {
  const end = at + length;
  if (end > bytes.length) {
    throw new Refusal(cutShort);
  }
  return end;
}
