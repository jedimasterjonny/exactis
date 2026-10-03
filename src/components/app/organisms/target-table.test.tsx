import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Cma, Mapping } from "@/data/cma";
import type { Target } from "@/data/targets";
import type { Answer } from "@/lib/answer";

import { mapCategory } from "@/actions/targets";
import { Toaster } from "@/components/kit/toast";
import { cma, mappings } from "@/data/cma.fixture";
import { targets } from "@/data/targets.fixture";
import { refused, saved } from "@/lib/answer";
import { heldBack } from "@/test/held-back";

import { TargetTable } from "./target-table";

vi.mock("@/actions/targets", () => ({ mapCategory: vi.fn() }));

// A category at the top of the taxonomy, beneath no class, that asks
// for nothing and has nothing assigned to it.
const cash: Target = {
  classes: [],
  id: "cash",
  isImplemented: false,
  name: "Cash",
  share: 0,
};

// UK equity, which the reference maps onto UK large cap equities.
const ukEquity = targets.categories[2];

// Each group of rows as read down: its row, its name, what its return
// is, the return and its share,
// then each category in it, its name, class, return and target, the
// class read as its select shows it, or as its cell reads before there
// is one.
function groups(): readonly (readonly (string | undefined)[])[][] {
  return screen
    .getAllByRole("rowgroup")
    .slice(1)
    .map((group) => {
      const [head, ...rows] = within(group).getAllByRole("row");
      const [, detail, rate, share] = within(head ?? group).getAllByRole(
        "cell",
      );
      return [
        [
          within(head ?? group).getByRole("rowheader").textContent,
          detail?.textContent,
          rate?.textContent,
          share?.textContent,
        ],
        ...rows.map((row) => {
          const [, name, mapped, cellRate, target] =
            within(row).getAllByRole("cell");
          return [
            name?.textContent,
            within(mapped ?? row).queryByRole<HTMLSelectElement>("combobox")
              ?.value ?? mapped?.textContent,
            cellRate?.textContent,
            target?.textContent,
          ];
        }),
      ];
    });
}

// The table over the categories, vintage and mappings given, the
// reference's by default. A mapping reports through the toast manager,
// which needs its Toaster mounted.
function renderTable({
  categories = targets.categories,
  latest = cma,
  mapped = mappings,
}: {
  readonly categories?: readonly Target[];
  readonly latest?: Cma | null;
  readonly mapped?: readonly Mapping[];
} = {}): void {
  render(
    <TargetTable categories={categories} cma={latest} mappings={mapped} />,
    { wrapper: Toaster },
  );
}

// The cells of the row of the category named, as read across.
function rowOf(name: string): readonly HTMLElement[] {
  const row = screen
    .getAllByRole("row")
    .find((each) => within(each).queryAllByText(name).length > 0);
  if (row === undefined) {
    throw new Error(`No row for ${name}`);
  }
  return within(row).getAllByRole("cell");
}

// The class select of the category named, in its column.
function selectOf(name: string): HTMLSelectElement {
  return within(rowOf(name)[2] ?? document.body).getByRole<HTMLSelectElement>(
    "combobox",
    { name: `CMA class for ${name}` },
  );
}

describe("TargetTable", () => {
  it("heads the columns", () => {
    renderTable();

    expect(
      screen.getAllByRole("columnheader").map((head) => head.textContent),
    ).toStrictEqual(["Category", "CMA class", "20y return", "Target"]);
  });

  // The folded cell leads each row, then the four columns. Stocks are
  // four fifths of the whole, blending to 8.044% by their targets, and
  // bonds a fifth, to 4.451% with their hedged class at its hedged
  // return; FTSE North America has no class, so it is not blended, and
  // its group has no return.
  it("lays the categories out by the sleeve their class blends into, each group opening on its share and blended return", () => {
    renderTable();

    expect(groups()).toStrictEqual([
      [
        ["Stocks", "Blended by target, hedging included", "8.044%", "80.00%"],
        [
          "FTSE Global All Cap ex-UK",
          "Global ex-UK large cap equities",
          "7.722%",
          "48.00%",
        ],
        [
          "Global emerging markets",
          "Emerging large cap equities",
          "9.256%",
          "12.00%",
        ],
        ["UK equity", "UK large cap equities", "8.156%", "12.00%"],
        ["Global small cap", "Global small cap equities", "7.991%", "8.00%"],
        ["FTSE 100", "UK large cap equities", "8.156%", "0.00%"],
      ],
      [
        ["Bonds", "Blended by target, hedging included", "4.451%", "20.00%"],
        [
          "Global bonds, hedged",
          "Global aggregate bonds (GBP hedged)",
          "4.542%",
          "14.00%",
        ],
        [
          "UK index-linked gilts, 5y+Nothing implements it",
          "UK index-linked gilts (5+ year)",
          "4.570%",
          "4.00%",
        ],
        ["Short-dated gilts", "UK cash", "3.574%", "2.00%"],
      ],
      [
        ["Not blended", "No class the vintage prices", "—", "0.00%"],
        ["FTSE North AmericaNo CMA class", "", "—", "0.00%"],
      ],
    ]);
  });

  // Short-dated gilts onto UK large cap equities takes their 2% from
  // bonds to stocks, at 8.156%, and leaves bonds without UK cash's
  // 3.574%.
  it("moves a category to the other sleeve's group as a class of that sleeve is chosen", async () => {
    const answer = heldBack<Answer<readonly Mapping[]>>();
    vi.mocked(mapCategory).mockReturnValue(answer.promise);
    renderTable();

    fireEvent.change(selectOf("Short-dated gilts"), {
      target: { value: "UK large cap equities" },
    });

    await waitFor(() => {
      expect(groups()[0]?.[0]).toStrictEqual([
        "Stocks",
        "Blended by target, hedging included",
        "8.047%",
        "82.00%",
      ]);
    });
    expect(groups()[0]?.at(-1)?.[0]).toBe("Short-dated gilts");
    expect(groups()[1]?.[0]).toStrictEqual([
      "Bonds",
      "Blended by target, hedging included",
      "4.548%",
      "18.00%",
    ]);

    answer.answer(saved(mappings));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "CMA class saved" }),
      ).toBeInTheDocument();
    });
  });

  it("leaves out a group with nothing in it, and gives a group asking for nothing no return", () => {
    renderTable({ latest: null });

    expect(groups().map(([head]) => head)).toStrictEqual([
      ["Not blended", "No CMA pulled yet", "—", "100.00%"],
    ]);
  });

  // Short-dated gilts ask for 2% with no class, so the rates tab cannot
  // blend, and neither sleeve gives a return here either.
  it("gives the sleeves no return while a category asking for a share has no class, and says why", () => {
    renderTable({
      mapped: mappings.filter(({ asset }) => asset !== "UK cash"),
    });

    const why =
      "Not blended until every category asking for a share has a class";

    expect(groups().map(([head]) => head)).toStrictEqual([
      ["Stocks", why, "—", "80.00%"],
      ["Bonds", why, "—", "18.00%"],
      ["Not blended", "No class the vintage prices", "—", "2.00%"],
    ]);
  });

  it("folds a group's row as it folds a category's, its return beneath its name and share", () => {
    renderTable();

    const [folded, head] = within(
      screen.getAllByRole("rowgroup")[1] ?? document.body,
    ).getAllByRole("cell");

    expect(folded).toHaveClass("unfolded:hidden");
    expect(folded).toHaveTextContent(
      "Stocks80.00%8.044% · Blended by target, hedging included",
    );
    expect(head).toHaveClass("folded:hidden");
  });

  // A class carried into sterling from another currency says which, and
  // is chosen by its name alone.
  it("offers no class, then the latest vintage's classes under their sleeves' headings", () => {
    renderTable();

    const select = selectOf("UK equity");

    expect(
      within(select)
        .getAllByRole("group")
        .map((group) => [
          group.getAttribute("label"),
          within(group)
            .getAllByRole("option")
            .map((option) => option.textContent),
        ]),
    ).toStrictEqual([
      [
        "Equities",
        [
          "US large cap equities",
          "UK large cap equities",
          "Emerging large cap equities",
          "Global small cap equities",
          "Global ex-UK large cap equities",
          "Japan large cap equities (from JPY)",
          "US small cap equities (from USD)",
        ],
      ],
      [
        "Fixed income",
        [
          "UK index-linked gilts (5+ year)",
          "UK cash",
          "Global aggregate bonds",
          "Global aggregate bonds (GBP hedged)",
        ],
      ],
    ]);
    expect(within(select).getAllByRole("option")[0]).toHaveTextContent(
      "No class",
    );
    expect(
      within(select).getByRole("option", {
        name: "Japan large cap equities (from JPY)",
      }),
    ).toHaveValue("Japan large cap equities");
  });

  // The stored mappings come back with the page rather than with the
  // answer, so once the store has answered the row shows the class it
  // was given again.
  it("maps a category onto the class chosen, showing it and its return at once, and says so under a toast", async () => {
    const answer = heldBack<Answer<readonly Mapping[]>>();
    vi.mocked(mapCategory).mockReturnValue(answer.promise);
    renderTable();

    fireEvent.change(selectOf("UK equity"), {
      target: { value: "Global small cap equities" },
    });

    await waitFor(() => {
      expect(selectOf("UK equity")).toHaveValue("Global small cap equities");
    });
    expect(rowOf("UK equity")[3]).toHaveTextContent("7.991%");
    expect(mapCategory).toHaveBeenCalledExactlyOnceWith({
      asset: "Global small cap equities",
      category: ukEquity?.id,
    });

    answer.answer(saved(mappings));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "CMA class saved" }),
      ).toHaveAccessibleDescription("UK equity onto Global small cap equities");
    });
    await waitFor(() => {
      expect(selectOf("UK equity")).toHaveValue("UK large cap equities");
    });
  });

  it("maps a category onto no class, flagging one that asks for a share", async () => {
    const answer = heldBack<Answer<readonly Mapping[]>>();
    vi.mocked(mapCategory).mockReturnValue(answer.promise);
    renderTable();

    fireEvent.change(selectOf("UK equity"), { target: { value: "" } });

    await waitFor(() => {
      expect(selectOf("UK equity")).toHaveValue("");
    });
    expect(rowOf("UK equity")[3]).toHaveTextContent("—");
    expect(rowOf("UK equity")[1]).toHaveTextContent("UK equityNo CMA class");
    expect(mapCategory).toHaveBeenCalledExactlyOnceWith({
      asset: null,
      category: ukEquity?.id,
    });

    answer.answer(saved(mappings));

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "CMA class saved" }),
      ).toHaveAccessibleDescription("UK equity onto no class");
    });
  });

  it("puts the class back and says why when the store refuses", async () => {
    vi.mocked(mapCategory).mockResolvedValue(
      refused("The latest CMA prices no UK cash"),
    );
    renderTable();

    fireEvent.change(selectOf("UK equity"), { target: { value: "UK cash" } });

    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "CMA class not saved" }),
      ).toHaveAccessibleDescription("The latest CMA prices no UK cash");
    });
    await waitFor(() => {
      expect(selectOf("UK equity")).toHaveValue("UK large cap equities");
    });
  });

  it("flags a category asking for a share with no class, in the caution tone", () => {
    renderTable({
      mapped: mappings.filter(({ asset }) => asset !== "UK cash"),
    });

    const [folded, name] = rowOf("Short-dated gilts");

    expect(
      within(name ?? document.body).getByText("No CMA class"),
    ).toHaveAttribute("data-variant", "caution");
    expect(
      within(folded ?? document.body).getByText("No CMA class"),
    ).toHaveClass("text-caution");
  });

  // FTSE North America asks for nothing and has no class, so weighs
  // nothing in the blend; it is flagged all the same, muted, since it
  // would keep the rates from being derived once it were given a share.
  it("flags a category asking for nothing with no class, muted", () => {
    renderTable();

    const [folded, name] = rowOf("FTSE North America");
    const badge = within(name ?? document.body).getByText("No CMA class");

    expect(badge).toHaveAttribute("data-variant", "outline");
    expect(badge).toHaveClass("text-muted-foreground");
    expect(badge).not.toHaveClass("label");
    expect(
      within(folded ?? document.body).getByText("No CMA class"),
    ).not.toHaveClass("text-caution");
    expect(screen.getAllByText("No CMA class")).toHaveLength(2);
  });

  it("keeps a class the vintage no longer prices, offered on its own, flagged and with no return", () => {
    renderTable({
      mapped: [
        ...mappings.filter(({ category }) => category !== ukEquity?.id),
        { asset: "Canada large cap equities", category: ukEquity?.id ?? "" },
      ],
    });

    const [, name, , rate] = rowOf("UK equity");
    const [stale] = within(selectOf("UK equity")).getAllByRole("group");

    expect(selectOf("UK equity")).toHaveValue("Canada large cap equities");
    expect(stale).toHaveAttribute("label", "Not in the August 2026 CMA");
    expect(within(stale ?? document.body).getAllByRole("option")).toHaveLength(
      1,
    );
    expect(name).toHaveTextContent("UK equityNot in the August 2026 CMA");
    expect(rate).toHaveTextContent(/^—$/);
    expect(rate).toHaveClass("text-muted-foreground");
  });

  // Nothing can be chosen before a CMA is pulled, so nothing is flagged
  // for want of a class either.
  it("dashes the class and its return before a CMA is pulled", () => {
    renderTable({ latest: null });

    const [, name, mapped, rate] = rowOf("UK equity");

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(mapped).toHaveTextContent(/^—$/);
    expect(rate).toHaveTextContent(/^—$/);
    expect(name).toHaveTextContent(/^UK equity$/);
  });

  it("flags a category asking for something that nothing implements, in the caution tone", () => {
    renderTable();

    const [folded, name] = rowOf("UK index-linked gilts, 5y+");
    const flag = within(name ?? document.body).getByText(
      "Nothing implements it",
    );

    expect(flag).toHaveAttribute("data-variant", "caution");
    expect(flag).not.toHaveClass("label");
    expect(
      within(folded ?? document.body).getByText("Nothing implements it"),
    ).toHaveClass("text-caution");
    expect(screen.getAllByText("Nothing implements it")).toHaveLength(2);
  });

  it("mutes a target of nothing, and flags one that asks for nothing for its class alone", () => {
    renderTable({ categories: [...targets.categories, cash] });

    const [foldedZero, , , , zero] = rowOf("FTSE 100");
    const [foldedHeld, , , , held] = rowOf("UK equity");

    expect(zero).toHaveClass("text-muted-foreground");
    expect(held).not.toHaveClass("text-muted-foreground");
    expect(within(foldedZero ?? document.body).getByText("0.00%")).toHaveClass(
      "text-muted-foreground",
    );
    expect(
      within(foldedHeld ?? document.body).getByText("12.00%"),
    ).not.toHaveClass("text-muted-foreground");
    expect(rowOf("Cash")[1]).toHaveTextContent(/^CashNo CMA class$/);
    expect(rowOf("Cash")[1]).not.toHaveTextContent("Nothing implements it");
  });

  it("folds a category with nothing to map it onto into its name, its target and dashes", () => {
    renderTable({ categories: [cash], latest: null });

    const [folded, , , , target] = rowOf("Cash");

    expect(target).toHaveTextContent("0.00%");
    expect(folded).toHaveTextContent(/^Cash0\.00%——$/);
  });

  // The folded cell is drawn only while the table is narrow, and the
  // columns only while it is wide, so either reads the row once.
  it("folds each row into one cell with the name and target on its first line, and the class beneath", () => {
    renderTable();

    const [folded, ...columns] = rowOf("FTSE Global All Cap ex-UK");

    expect(folded).toHaveClass("unfolded:hidden");
    expect(folded).toHaveTextContent(/^FTSE Global All Cap ex-UK48\.00%/);
    expect(
      within(folded ?? document.body).getByRole("combobox", {
        name: "CMA class for FTSE Global All Cap ex-UK",
      }),
    ).toHaveValue("Global ex-UK large cap equities");
    expect(folded).toHaveTextContent(/7\.722%$/);
    expect(
      within(folded ?? document.body).queryByRole("button"),
    ).not.toBeInTheDocument();
    for (const column of columns) {
      expect(column).toHaveClass("folded:hidden");
    }
  });
});
