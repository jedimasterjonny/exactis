// @vitest-environment node
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { accounts, expenseLines, incomeLines, plan } from "./schema";

// The links each table carries and the column each points at, read off
// the table as drizzle-kit reads them, in the order of the columns they
// hang on. The reference is a thunk, since the accounts table refers to
// itself, and is read here so the schema says what it declares rather
// than what a migration once wrote.
function linksOf(
  table: typeof accounts | typeof expenseLines | typeof incomeLines,
): {
  readonly column: string;
  readonly foreignColumn: string;
  readonly foreignTable: string;
}[] {
  return getTableConfig(table)
    .foreignKeys.map((key) => {
      const { columns, foreignColumns, foreignTable } = key.reference();
      return {
        column: columns.map((column) => column.name).join(),
        foreignColumn: foreignColumns.map((column) => column.name).join(),
        foreignTable: getTableConfig(foreignTable).name,
      };
    })
    .sort((one, other) => one.column.localeCompare(other.column));
}

describe("schema", () => {
  it("points a loan's link and each schedule's line's link at the accounts' id, and a wrapper's at its owner's", () => {
    expect(linksOf(accounts)).toStrictEqual([
      { column: "owner", foreignColumn: "id", foreignTable: "owners" },
      { column: "secures", foreignColumn: "id", foreignTable: "accounts" },
    ]);
    expect(linksOf(expenseLines)).toStrictEqual([
      { column: "pays", foreignColumn: "id", foreignTable: "accounts" },
    ]);
    expect(linksOf(incomeLines)).toStrictEqual([
      { column: "feeds", foreignColumn: "id", foreignTable: "accounts" },
    ]);
  });

  it("holds the plan to its one row", () => {
    expect(
      getTableConfig(plan).checks.map((check) => check.name),
    ).toStrictEqual(["plan_single"]);
  });
});
