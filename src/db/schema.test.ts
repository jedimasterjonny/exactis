// @vitest-environment node
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { accounts, expenseLines, incomeLines } from "./schema";

// The link each table carries and the column it points at, read off the
// table as drizzle-kit reads it. The reference is a thunk, since the
// accounts table refers to itself, and is read here so the schema says
// what it declares rather than what a migration once wrote.
function linkOf(
  table: typeof accounts | typeof expenseLines | typeof incomeLines,
): {
  readonly column: string;
  readonly foreignColumn: string;
  readonly foreignTable: string;
} {
  const [key] = getTableConfig(table).foreignKeys;
  if (key === undefined) {
    throw new Error("The table carries no link");
  }
  const { columns, foreignColumns, foreignTable } = key.reference();
  return {
    column: columns.map((column) => column.name).join(),
    foreignColumn: foreignColumns.map((column) => column.name).join(),
    foreignTable: getTableConfig(foreignTable).name,
  };
}

describe("schema", () => {
  it("points a loan's link and each schedule's line's link at the accounts' id", () => {
    expect(linkOf(accounts)).toStrictEqual({
      column: "secures",
      foreignColumn: "id",
      foreignTable: "accounts",
    });
    expect(linkOf(expenseLines)).toStrictEqual({
      column: "pays",
      foreignColumn: "id",
      foreignTable: "accounts",
    });
    expect(linkOf(incomeLines)).toStrictEqual({
      column: "feeds",
      foreignColumn: "id",
      foreignTable: "accounts",
    });
  });
});
