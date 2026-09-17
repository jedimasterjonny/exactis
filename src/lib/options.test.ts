import { describe, expect, it } from "vitest";

import { optionsOf } from "./options";

describe("optionsOf", () => {
  it("names each choice as its label says, in the order given", () => {
    expect(
      optionsOf({ month: "A month", year: "A year" }, ["year", "month"]),
    ).toStrictEqual([
      { label: "A year", value: "year" },
      { label: "A month", value: "month" },
    ]);
  });
});
