// @vitest-environment node
import { describe, expect, it } from "vitest";

import { Refusal } from "@/lib/answer";
import { protobufOf } from "@/lib/protobuf.fixture";

import {
  int32At,
  int64At,
  joined,
  messageOf,
  messagesAt,
  textAt,
  varintOf,
  withMessagesAt,
  withWholeAt,
} from "./protobuf";

// A key and what follows it, written byte by byte, for a field the
// fixture does not write.
function raw(...bytes: readonly number[]): Uint8Array {
  return new Uint8Array(bytes);
}

describe("messageOf", () => {
  it("reads each field under its number, in the order written", () => {
    const message = messageOf(
      protobufOf([
        [1, 7],
        [2, "first"],
        [1, 300],
        [2, raw(0xff, 0)],
      ]),
    );

    expect(message).toStrictEqual(
      new Map([
        [1, [7n, 300n]],
        [2, [new TextEncoder().encode("first"), raw(0xff, 0)]],
      ]),
    );
  });

  it("reads nothing out of no bytes", () => {
    expect(messageOf(raw())).toStrictEqual(new Map());
  });

  it("steps over a field of a fixed width, keeping what follows", () => {
    const message = messageOf(
      raw(0x09, 1, 2, 3, 4, 5, 6, 7, 8, 0x15, 1, 2, 3, 4, 0x18, 5),
    );

    expect(message).toStrictEqual(new Map([[3, [5n]]]));
  });

  it("refuses a field of a group's wire type, or any the wire does not write", () => {
    expect(() => messageOf(raw(0x0b))).toThrow(
      new Refusal(
        "The data has a field of wire type 3, which proto3 does not write",
      ),
    );
    expect(() => messageOf(raw(0x0e))).toThrow(
      new Refusal(
        "The data has a field of wire type 6, which proto3 does not write",
      ),
    );
  });

  it("refuses a field the bytes end partway through", () => {
    const cutShort = new Refusal(
      "The data is cut short partway through a field",
    );

    expect(() => messageOf(raw(0x08, 0x80))).toThrow(cutShort);
    expect(() => messageOf(raw(0x12, 3, 1, 2))).toThrow(cutShort);
    expect(() => messageOf(raw(0x09, 1, 2, 3))).toThrow(cutShort);
    expect(() => messageOf(raw(0x15, 1))).toThrow(cutShort);
  });

  it("refuses a length read as below nothing", () => {
    expect(() => messageOf(raw(0x12, ...varintOf(-1), 1))).toThrow(
      new Refusal("The data is cut short partway through a field"),
    );
  });

  it("refuses a varint longer than ten bytes", () => {
    expect(() =>
      messageOf(raw(0x08, ...Array<number>(10).fill(0x80), 1)),
    ).toThrow(new Refusal("The data holds a varint longer than 10 bytes"));
  });
});

describe("int32At", () => {
  it("reads the number written last under the number given", () => {
    const message = messageOf(
      protobufOf([
        [1, 10_000],
        [1, 2500],
      ]),
    );

    expect(int32At(message, 1)).toBe(2500);
  });

  it("reads nought for a field never written, as proto3 leaves a nought out", () => {
    expect(int32At(messageOf(protobufOf([[1, 4]])), 2)).toBe(0);
  });

  // A negative int32 is widened to ten bytes as a negative int64 is,
  // and the bytes past the 32nd bit carry nothing but the widening.
  it("reads a negative int32 back through its widening", () => {
    expect(int32At(messageOf(protobufOf([[1, -3]])), 1)).toBe(-3);
    expect(int32At(messageOf(protobufOf([[1, -2_147_483_648]])), 1)).toBe(
      -2_147_483_648,
    );
    expect(int32At(messageOf(protobufOf([[1, 2_147_483_647]])), 1)).toBe(
      2_147_483_647,
    );
  });

  it("refuses bytes where a number is read", () => {
    expect(() => int32At(messageOf(protobufOf([[4, "text"]])), 4)).toThrow(
      new Refusal("The data holds bytes where field 4's number is read"),
    );
  });
});

describe("int64At", () => {
  it("reads a number wider than an int32 whole", () => {
    expect(int64At(messageOf(protobufOf([[2, 21_345_600_000]])), 2)).toBe(
      21_345_600_000,
    );
  });

  it("reads nought for a field never written", () => {
    expect(int64At(messageOf(protobufOf([[1, 4]])), 2)).toBe(0);
  });

  it("reads a negative int64 back through its widening", () => {
    expect(int64At(messageOf(protobufOf([[1, -3]])), 1)).toBe(-3);
  });
});

describe("textAt", () => {
  it("reads the string written last under the number given, as UTF-8", () => {
    const message = messageOf(
      protobufOf([
        [3, "Bonds"],
        [3, "Gilts, £"],
      ]),
    );

    expect(textAt(message, 3)).toBe("Gilts, £");
  });

  it("reads nothing for a string never written", () => {
    expect(textAt(messageOf(protobufOf([[3, "Bonds"]])), 2)).toBeUndefined();
  });

  it("refuses a number where bytes are read", () => {
    expect(() => textAt(messageOf(protobufOf([[2, 9]])), 2)).toThrow(
      new Refusal("The data holds a number where field 2's bytes are read"),
    );
  });
});

describe("messagesAt", () => {
  it("reads each message written under the number given, in the order written", () => {
    const message = messageOf(
      protobufOf([
        [5, [[1, "first"]]],
        [6, "between"],
        [
          5,
          [
            [1, "second"],
            [6, 9000],
          ],
        ],
      ]),
    );

    const read = messagesAt(message, 5);

    expect(read.map((each) => textAt(each, 1))).toStrictEqual([
      "first",
      "second",
    ]);
    expect(read.map((each) => int32At(each, 6))).toStrictEqual([0, 9000]);
  });

  it("reads none where none was written", () => {
    expect(messagesAt(messageOf(protobufOf([[1, 1]])), 5)).toStrictEqual([]);
  });

  it("refuses a number where a message is read", () => {
    expect(() => messagesAt(messageOf(protobufOf([[5, 1]])), 5)).toThrow(
      new Refusal("The data holds a number where field 5's bytes are read"),
    );
  });
});

describe("varintOf", () => {
  it("writes a whole number in as few bytes as hold it, low bits first", () => {
    expect(varintOf(0)).toStrictEqual(raw(0));
    expect(varintOf(127)).toStrictEqual(raw(127));
    expect(varintOf(300)).toStrictEqual(raw(0xac, 0x02));
    expect(varintOf(21_345_600_000)).toStrictEqual(
      raw(0x80, 0x84, 0xb0, 0xc2, 0x4f),
    );
  });

  it("widens a negative number to ten bytes, as a negative int32 is written", () => {
    expect(varintOf(-1)).toStrictEqual(
      raw(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01),
    );
  });
});

describe("joined", () => {
  it("lays the parts end to end, and nothing from none", () => {
    expect(joined([raw(1, 2), raw(), raw(3)])).toStrictEqual(raw(1, 2, 3));
    expect(joined([])).toStrictEqual(raw());
  });
});

describe("withMessagesAt", () => {
  it("rewrites each message under the number given as the edit makes it, keeping every other field as written", () => {
    const written = protobufOf([
      [1, 7],
      [5, [[1, "first"]]],
      [6, "between"],
      [5, [[1, "second"]]],
    ]);

    const edited = withMessagesAt(written, 5, (message) =>
      withWholeAt(message, 6, 9000),
    );

    expect(edited).toStrictEqual(
      protobufOf([
        [1, 7],
        [
          5,
          [
            [1, "first"],
            [6, 9000],
          ],
        ],
        [6, "between"],
        [
          5,
          [
            [1, "second"],
            [6, 9000],
          ],
        ],
      ]),
    );
  });

  // The fixture writes no field of a fixed width, so one is written
  // byte by byte: a fixed64 under 1 and a fixed32 under 2.
  it("keeps a field of a fixed width byte for byte", () => {
    const written = raw(0x09, 1, 2, 3, 4, 5, 6, 7, 8, 0x15, 1, 2, 3, 4);

    expect(withMessagesAt(written, 3, () => raw())).toStrictEqual(written);
  });

  it("refuses a number, or a field of a fixed width, where a message is rewritten", () => {
    const refusal = new Refusal(
      "The data holds a number where field 5's bytes are read",
    );

    expect(() => withMessagesAt(protobufOf([[5, 1]]), 5, (m) => m)).toThrow(
      refusal,
    );
    expect(() => withMessagesAt(raw(0x2d, 1, 2, 3, 4), 5, (m) => m)).toThrow(
      refusal,
    );
  });
});

describe("withWholeAt", () => {
  it("writes the number in the place of the first written under its number, and drops any other", () => {
    const written = protobufOf([
      [1, "before"],
      [6, 2500],
      [7, 1],
      [6, 7000],
    ]);

    expect(withWholeAt(written, 6, 9000)).toStrictEqual(
      protobufOf([
        [1, "before"],
        [6, 9000],
        [7, 1],
      ]),
    );
  });

  it("writes the number at the end where none was written under its number", () => {
    expect(withWholeAt(protobufOf([[1, "only"]]), 6, 300)).toStrictEqual(
      protobufOf([
        [1, "only"],
        [6, 300],
      ]),
    );
  });

  it("writes nothing for a nought, as proto3 leaves one unwritten", () => {
    const written = protobufOf([
      [6, 2500],
      [7, 1],
    ]);

    expect(withWholeAt(written, 6, 0)).toStrictEqual(protobufOf([[7, 1]]));
    expect(withWholeAt(protobufOf([[7, 1]]), 6, 0)).toStrictEqual(
      protobufOf([[7, 1]]),
    );
  });

  it("writes into no bytes", () => {
    expect(withWholeAt(raw(), 6, 5)).toStrictEqual(protobufOf([[6, 5]]));
  });
});
