import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CellSelect } from "./cell-select";

const groups = [
  {
    label: "Equities",
    options: [
      { label: "UK large cap equities", value: "UK large cap equities" },
      {
        label: "Global small cap equities",
        value: "Global small cap equities",
      },
    ],
  },
  { label: "Fixed income", options: [{ label: "UK cash", value: "UK cash" }] },
];

describe("CellSelect", () => {
  it("names the select by what it chooses and offers none first, then each group under its heading", () => {
    render(
      <CellSelect
        groups={groups}
        label="CMA class for UK equity"
        none="No class"
        onValueChange={vi.fn<(value: null | string) => void>()}
        value="UK large cap equities"
      />,
    );

    const select = screen.getByRole("combobox", {
      name: "CMA class for UK equity",
    });

    expect(select).toHaveValue("UK large cap equities");
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toStrictEqual([
      "No class",
      "UK large cap equities",
      "Global small cap equities",
      "UK cash",
    ]);
    expect(
      within(select)
        .getAllByRole("group")
        .map((group) => group.getAttribute("label")),
    ).toStrictEqual(["Equities", "Fixed income"]);
  });

  it("shows none for a value of none", () => {
    render(
      <CellSelect
        groups={groups}
        label="CMA class"
        none="No class"
        onValueChange={vi.fn<(value: null | string) => void>()}
        value={null}
      />,
    );

    expect(screen.getByRole("combobox")).toHaveValue("");
  });

  // The caller holds the choice, so the select shows what it is given
  // until the caller gives it the one reported.
  it("reports the value chosen, or null for none, and shows what its caller gives", () => {
    const onValueChange = vi.fn<(value: null | string) => void>();
    render(
      <CellSelect
        groups={groups}
        label="CMA class"
        none="No class"
        onValueChange={onValueChange}
        value="UK cash"
      />,
    );
    const select = screen.getByRole("combobox");

    fireEvent.change(select, {
      target: { value: "Global small cap equities" },
    });
    fireEvent.change(select, { target: { value: "" } });

    expect(onValueChange.mock.calls).toStrictEqual([
      ["Global small cap equities"],
      [null],
    ]);
    expect(select).toHaveValue("UK cash");
  });
});
