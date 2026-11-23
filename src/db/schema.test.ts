// @vitest-environment node
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as z from "zod";

import { householdVersions, portfolioFiles } from "./schema";

const bytes = z.instanceof(Uint8Array);

// The key is declared beside the columns and read only by drizzle-kit,
// so nothing the store runs reads it: this does, so the schema cannot
// key the table apart from the migrations that make it.
describe("householdVersions", () => {
  it("is keyed by the branch and the version together", () => {
    expect(
      getTableConfig(householdVersions).primaryKeys.map((key) =>
        key.columns.map(({ name }) => name),
      ),
    ).toStrictEqual([["scenario", "version"]]);
  });
});

describe("portfolioFiles", () => {
  it("keys on version, declares content as bytea, and normalizes driver values to standalone Uint8Arrays", () => {
    const { columns } = getTableConfig(portfolioFiles);
    const version = columns.find(({ name }) => name === "version");
    const content = columns.find(({ name }) => name === "content");

    expect(version?.primary).toBe(true);
    expect(content?.getSQLType()).toBe("bytea");

    const plain = new Uint8Array([0x00, 0x50, 0xff]);
    const fromPlain = bytes.parse(
      portfolioFiles.content.mapFromDriverValue(plain),
    );
    expect(fromPlain).toStrictEqual(plain);
    expect(fromPlain.buffer).not.toBe(plain.buffer);

    const buffered = Buffer.from([0x00, 0x7f, 0xff]);
    const fromBuffer = bytes.parse(
      portfolioFiles.content.mapFromDriverValue(buffered),
    );
    expect(fromBuffer).toStrictEqual(new Uint8Array([0x00, 0x7f, 0xff]));
    expect(Buffer.isBuffer(fromBuffer)).toBe(false);
    expect(fromBuffer.buffer).not.toBe(buffered.buffer);
  });
});
