// @vitest-environment node
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { householdVersions } from "./schema";

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
