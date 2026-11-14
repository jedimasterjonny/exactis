import type { RenderResult } from "@testing-library/react";
import type { ComponentProps } from "react";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { closeBalances } from "@/actions/accounts";
import { Toaster } from "@/components/kit/toast";
import { accounts } from "@/data/accounts.fixture";
import { incomeLines, plan } from "@/data/income.fixture";
import { refused, saved } from "@/lib/answer";
import { commit, field, select } from "@/test/dom";

import { MonthEnd } from "./month-end";

const replace = vi.hoisted(() => vi.fn());

vi.mock("@/actions/accounts", () => ({ closeBalances: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: (): { readonly replace: typeof replace } => ({ replace }),
}));

const [pension, isa, , home] = accounts;
const [salary] = incomeLines;

// The steps of the balances the month leaves, and what they come to.
function ledger(sheet: HTMLElement): (null | string)[] {
  return within(sheet)
    .getAllByRole("listitem")
    .map((step) => step.textContent);
}

// The month end over the fixture's accounts, their plan running from
// September 2026 on balances as of the end of August, on the fourth of
// October, when September is the last month that has ended, the salary
// feeding the pension.
const opening = {
  accounts,
  isUpdating: false,
  month: { month: 8, year: 2026 },
  plan,
  schedule: { expenses: [], income: [salary] },
  today: "2026-10-04",
} satisfies ComponentProps<typeof MonthEnd>;

// The note over a draft this tab kept.
const restored =
  "The balances are as they were left in this tab, kept until saved or the tab is closed.";

// The month end as above, with whatever a test gives in its place. Save
// reports through the toast manager, which needs its Toaster mounted.
function drawWorksheet(
  props: Partial<ComponentProps<typeof MonthEnd>> = {},
): RenderResult {
  return render(<MonthEnd {...opening} {...props} />, { wrapper: Toaster });
}

// The sentences of the screen's paragraphs, its notes among them.
function notes(): (null | string)[] {
  return screen
    .queryAllByRole("paragraph")
    .map(({ textContent }) => textContent);
}

// The worksheet's card, drawn as drawWorksheet draws it.
function openWorksheet(
  props: Partial<ComponentProps<typeof MonthEnd>> = {},
): HTMLElement {
  drawWorksheet(props);
  return screen.getByRole("region", { name: /^Balances on/ });
}

// The month end taken down and drawn again from nothing, as a reload
// draws it, with whatever a test gives in place of the opening's.
function reload(
  { unmount }: RenderResult,
  props: Partial<ComponentProps<typeof MonthEnd>> = {},
): HTMLElement {
  unmount();
  return openWorksheet(props);
}

describe("MonthEnd", () => {
  // jsdom keeps one storage for the file's window, and the order is
  // shuffled, so a draft one test left would land in the next.
  beforeEach(() => {
    sessionStorage.clear();
  });

  // September carried, the one month from the plan's first through the
  // month closed, the pension is expected at £397,603 with £4,350 paid
  // in, the salary's sacrifice with the NI saved, its own sum and the
  // relief on it; the ISA at £274,711; the current account where it
  // was; the home grown a month at 2.1%; and the mortgage £175,053 owed
  // once £2,180 is paid off it, which the number field writes with the
  // hyphen Intl gives it rather than the minus the ledger writes.
  it("opens on the last month that has ended, each balance at what the plan expected of it, in its group", () => {
    const sheet = openWorksheet();

    expect(within(sheet).getByText("Sect. VII.i")).toHaveClass("label");
    expect(
      within(sheet).getByRole("heading", { name: "Balances on 25 Sep 2026" }),
    ).toBeInTheDocument();
    expect(select("Month")).toHaveValue("8");
    expect(field("Year")).toHaveValue("2026");
    for (const name of ["Savings", "Property & vehicles", "Loans & debts"]) {
      expect(within(sheet).getByRole("group", { name })).toBeInTheDocument();
    }
    for (const [name, figure] of [
      ["Workplace pension", "£397,603"],
      ["Stocks & shares ISA", "£274,711"],
      ["Current account", "£16,900"],
      ["Home", "£398,201"],
      ["Mortgage", "-£175,053"],
    ] as const) {
      expect(field(name)).toHaveValue(figure);
    }
    expect(field("Workplace pension")).toHaveAccessibleDescription(
      "Was £391,640 · £4,350 paid in · not dated",
    );
    expect(field("Current account")).toHaveAccessibleDescription(
      "Was £16,900 · nothing paid in · not dated",
    );
    expect(field("Mortgage")).toHaveAccessibleDescription(
      "Was −£176,520 · £2,180 paid off · not dated",
    );
    expect(within(sheet).getByText("0 of 5 checked")).toBeInTheDocument();
    expect(ledger(sheet)).toStrictEqual([
      "As the balances stood25 Aug 2026£901,462",
      "Paid in£0",
      "MovedMarkets, interest and the unexpected£0",
    ]);
  });

  // The mortgage checked by its own press first, so the loans' group has
  // none left; the home is the rest of the property's, checked as it
  // reads; and the savings are offered no such press.
  it("checks the rest of the property or the loans as they read in one press, and never the savings", async () => {
    const sheet = openWorksheet();
    vi.mocked(closeBalances).mockResolvedValue(
      saved({ asOf: { month: 8, year: 2026 }, isRecorded: true }),
    );
    const group = (name: string): HTMLElement =>
      within(sheet).getByRole("group", { name });

    expect(
      within(group("Savings")).queryByRole("button", {
        name: "Check the rest",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(sheet).getByRole("button", { name: "Check Mortgage" }),
    );

    expect(
      within(group("Loans & debts")).queryByRole("button", {
        name: "Check the rest",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(group("Property & vehicles")).getByRole("button", {
        name: "Check the rest",
      }),
    );

    expect(
      within(sheet).getByRole("button", { name: "Check Home" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(within(sheet).getByText("2 of 5 checked")).toBeInTheDocument();
    expect(
      within(group("Property & vehicles")).queryByRole("button", {
        name: "Check the rest",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(closeBalances).toHaveBeenCalledExactlyOnceWith({
      asOf: { month: 8, year: 2026 },
      balances: [
        { balance: 398201, id: home.id },
        { balance: -175053, id: 5 },
      ],
    });
    await screen.findByRole("dialog", { name: "Balances updated" });
    expect(sessionStorage).toHaveLength(0);
  });

  it("says the day a balance was last set until it is checked", () => {
    openWorksheet({ accounts: [{ ...home, setOn: "2026-03-14" }] });

    expect(field("Home")).toHaveAccessibleDescription(
      "Was £397,512 · nothing paid in · set 14 Mar 2026 · 204 days old",
    );
  });

  // Checking the pension and the mortgage as they read: the pension
  // moved £1,613 besides what was paid in, and the mortgage was charged
  // £713 of interest, so the month leaves £908,892.
  it("checks a balance as it reads, and says what moved it", async () => {
    const view = drawWorksheet();
    const sheet = screen.getByRole("region", { name: /^Balances on/ });
    vi.mocked(closeBalances).mockResolvedValue(
      saved({ asOf: { month: 8, year: 2026 }, isRecorded: true }),
    );

    const box = within(sheet).getByRole("button", {
      name: "Check Workplace pension",
    });

    // Unchecked, the press is an empty box.
    // eslint-disable-next-line testing-library/no-node-access -- the box is an icon hidden from the tree, with no role or text of its own
    expect(box.querySelector("svg")).toHaveClass("lucide-square");

    fireEvent.click(box);
    fireEvent.click(
      within(sheet).getByRole("button", { name: "Check Mortgage" }),
    );

    expect(
      within(sheet).getByRole("button", { name: "Check Workplace pension" }),
    ).toHaveAttribute("aria-pressed", "true");
    // Checked, it is ticked, so it reads without its colour.
    // eslint-disable-next-line testing-library/no-node-access -- the box is an icon hidden from the tree, with no role or text of its own
    expect(box.querySelector("svg")).toHaveClass("lucide-square-check");
    expect(field("Workplace pension")).toHaveAccessibleDescription(
      "Was £391,640 · £4,350 paid in · £1,613 moved",
    );
    expect(field("Mortgage")).toHaveAccessibleDescription(
      "Was −£176,520 · £2,180 paid off · −£713 moved",
    );
    expect(within(sheet).getByText("2 of 5 checked")).toBeInTheDocument();
    expect(ledger(sheet).slice(1)).toStrictEqual([
      "Paid in£6,530",
      "MovedMarkets, interest and the unexpected£900",
    ]);
    expect(
      within(sheet).getByText("As the balances stand on 25 Sep 2026"),
    ).toHaveClass("label");
    expect(within(sheet).getByText("£908,892")).toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(closeBalances).toHaveBeenCalledExactlyOnceWith({
      asOf: { month: 8, year: 2026 },
      balances: [
        { balance: 397603, id: pension.id },
        { balance: -175053, id: 5 },
      ],
    });
    expect(
      await screen.findByRole("dialog", { name: "Balances updated" }),
    ).toHaveAccessibleDescription(
      "2 balances set as of 25 Sep 2026, its progress point recorded",
    );
    expect(
      await within(sheet).findByText("0 of 5 checked"),
    ).toBeInTheDocument();
    expect(field("Workplace pension")).toHaveAccessibleDescription(
      "Was £391,640 · £4,350 paid in · not dated",
    );
    expect(replace).not.toHaveBeenCalled();
    expect(sessionStorage).toHaveLength(0);

    reload(view);

    expect(screen.getByText("0 of 5 checked")).toBeInTheDocument();
    expect(notes()).not.toContain(restored);
  });

  // The ISA's statement says £275,000, which checks it; the mortgage's
  // says £175,000 owed, typed without its sign; and a press unchecks
  // the pension again, so it is not sent.
  it("checks a balance typed, takes a debt typed as what is owed, and sends only what is checked", () => {
    const sheet = openWorksheet();
    vi.mocked(closeBalances).mockResolvedValue(
      saved({ asOf: { month: 8, year: 2026 }, isRecorded: true }),
    );

    commit(field("Stocks & shares ISA"), "275,000");
    commit(field("Mortgage"), "175,000");
    fireEvent.click(
      within(sheet).getByRole("button", { name: "Check Workplace pension" }),
    );
    fireEvent.click(
      within(sheet).getByRole("button", { name: "Check Workplace pension" }),
    );

    expect(field("Stocks & shares ISA")).toHaveAccessibleDescription(
      "Was £271,930 · £1,667 paid in · £1,403 moved",
    );
    expect(field("Mortgage")).toHaveValue("-£175,000");
    expect(within(sheet).getByText("2 of 5 checked")).toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(closeBalances).toHaveBeenCalledExactlyOnceWith({
      asOf: { month: 8, year: 2026 },
      balances: [
        { balance: 275000, id: isa.id },
        { balance: -175000, id: 5 },
      ],
    });
  });

  // Closing onto March, before the latest point kept, moves the balances
  // and records no point, so the toast says nothing of one.
  it("says nothing of a point where the month closed records none", async () => {
    const sheet = openWorksheet();
    vi.mocked(closeBalances).mockResolvedValue(
      saved({ asOf: { month: 2, year: 2026 }, isRecorded: false }),
    );

    fireEvent.change(select("Month"), { target: { value: "2" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(
      await screen.findByRole("dialog", { name: "Balances updated" }),
    ).toHaveAccessibleDescription("0 balances set as of 25 Mar 2026");
  });

  // Closing onto August, the month the balances are already as of, runs
  // no months: each balance opens at what it holds, nothing paid.
  it("runs no months onto the month the balances are as of, or one before it", () => {
    const sheet = openWorksheet();

    fireEvent.change(select("Month"), { target: { value: "7" } });

    expect(
      within(sheet).getByRole("heading", { name: "Balances on 25 Aug 2026" }),
    ).toBeInTheDocument();
    expect(field("Workplace pension")).toHaveValue("£391,640");
    expect(field("Workplace pension")).toHaveAccessibleDescription(
      "Was £391,640 · nothing paid in · not dated",
    );

    commit(field("Year"), "2025");

    expect(field("Workplace pension")).toHaveValue("£391,640");
  });

  // A year typed past the one it is is held at it, so the worksheet runs
  // the plan no further than the month the store would take; and a
  // loan typed as owing nothing reads as nothing, not as minus nothing.
  it("holds the year to the months the store takes, and a debt cleared at nothing", () => {
    openWorksheet();

    commit(field("Year"), "20266");

    expect(field("Year")).toHaveValue("2026");

    commit(field("Year"), "1850");

    expect(field("Year")).toHaveValue("1992");

    commit(field("Mortgage"), "0");

    expect(field("Mortgage")).toHaveValue("£0");
  });

  it("keeps the worksheet as it was and says why when the store refuses", async () => {
    const view = drawWorksheet();
    const sheet = screen.getByRole("region", { name: /^Balances on/ });
    const { promise, resolve: answer } =
      Promise.withResolvers<Awaited<ReturnType<typeof closeBalances>>>();
    vi.mocked(closeBalances).mockReturnValue(promise);

    fireEvent.click(
      within(sheet).getByRole("button", { name: "Check Mortgage" }),
    );
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(within(sheet).getByRole("button", { name: "Save" })).toHaveAttribute(
      "aria-busy",
      "true",
    );

    answer(refused("The balances are as of a month that has ended"));

    expect(
      await screen.findByRole("dialog", { name: "Balances not saved" }),
    ).toHaveAccessibleDescription(
      "The balances are as of a month that has ended",
    );
    expect(within(sheet).getByText("1 of 5 checked")).toBeInTheDocument();

    reload(view);

    expect(screen.getByText("1 of 5 checked")).toBeInTheDocument();
    expect(notes()).toContain(restored);
  });

  // The ISA typed from its statement, the mortgage checked as it reads
  // and August picked, then the page reloaded: all three come back,
  // under the note and the press that starts again, which stay through
  // the next press.
  it("keeps the figures typed, the presses and the month picked through a reload, under a note that stays", () => {
    const view = drawWorksheet();

    commit(field("Stocks & shares ISA"), "275,000");
    fireEvent.click(screen.getByRole("button", { name: "Check Mortgage" }));
    fireEvent.change(select("Month"), { target: { value: "7" } });

    expect(notes()).not.toContain(restored);

    const sheet = reload(view);

    expect(
      within(sheet).getByRole("heading", { name: "Balances on 25 Aug 2026" }),
    ).toBeInTheDocument();
    expect(select("Month")).toHaveValue("7");
    expect(field("Stocks & shares ISA")).toHaveValue("£275,000");
    expect(
      within(sheet).getByRole("button", { name: "Check Mortgage" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(within(sheet).getByText("2 of 5 checked")).toBeInTheDocument();
    expect(notes()).toContain(restored);
    expect(
      within(sheet).getByRole("button", { name: "Start again" }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(sheet).getByRole("button", { name: "Check Current account" }),
    );

    expect(within(sheet).getByText("3 of 5 checked")).toBeInTheDocument();
    expect(notes()).toContain(restored);
  });

  // The server cannot read the tab, so it draws the ISA at the £274,711
  // the plan expected, and hydrating that draws the same; the £275,000
  // kept lands in the render after, with no mismatch for React to log.
  it("draws the worksheet as it opens on the server and through hydration, then the draft kept", () => {
    const { unmount } = drawWorksheet();
    commit(field("Stocks & shares ISA"), "275,000");
    unmount();

    // eslint-disable-next-line testing-library/render-result-naming-convention -- renderToString returns a string, not a Testing Library render result
    const markup = renderToString(<MonthEnd {...opening} />);

    expect(markup).toContain("£274,711");
    expect(markup).not.toContain("£275,000");
    expect(markup).not.toContain(restored);

    const container = document.createElement("div");
    container.innerHTML = markup;
    document.body.append(container);
    render(<MonthEnd {...opening} />, { container, hydrate: true });

    expect(field("Stocks & shares ISA")).toHaveValue("£275,000");
    expect(notes()).toContain(restored);
  });

  // A press and its undoing leave nothing a fresh worksheet does not
  // have, so nothing is kept to come back as restored.
  it("keeps nothing where nothing is checked or typed", () => {
    const view = drawWorksheet();

    fireEvent.click(screen.getByRole("button", { name: "Check Mortgage" }));
    fireEvent.click(screen.getByRole("button", { name: "Check Mortgage" }));

    expect(sessionStorage).toHaveLength(0);

    reload(view);

    expect(notes()).not.toContain(restored);
  });

  // The mortgage's press restored, then undone: nothing is kept, so the
  // note no longer says it is, and a reload opens afresh.
  it("drops the note once a restored draft is edited down to nothing", () => {
    const { unmount } = drawWorksheet();
    fireEvent.click(screen.getByRole("button", { name: "Check Mortgage" }));
    unmount();
    const view = drawWorksheet();

    expect(notes()).toContain(restored);

    fireEvent.click(screen.getByRole("button", { name: "Check Mortgage" }));

    expect(notes()).not.toContain(restored);
    expect(
      screen.queryByRole("button", { name: "Start again" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("0 of 5 checked")).toBeInTheDocument();

    reload(view);

    expect(notes()).not.toContain(restored);
    expect(screen.getByText("0 of 5 checked")).toBeInTheDocument();
  });

  // October is cut while September's close is open: the worksheet on
  // the screen keeps September and its figures, and a reload after the
  // cut opens October afresh.
  it("keeps the draft while the month cut last moves on, and opens the next afresh on a reload", () => {
    const view = drawWorksheet();
    commit(field("Stocks & shares ISA"), "275,000");

    view.rerender(<MonthEnd {...opening} month={{ month: 9, year: 2026 }} />);

    expect(
      screen.getByRole("heading", { name: "Balances on 25 Sep 2026" }),
    ).toBeInTheDocument();
    expect(field("Stocks & shares ISA")).toHaveValue("£275,000");

    reload(view, { month: { month: 9, year: 2026 } });

    expect(
      screen.getByRole("heading", { name: "Balances on 23 Oct 2026" }),
    ).toBeInTheDocument();
    expect(screen.getByText("0 of 5 checked")).toBeInTheDocument();
    expect(notes()).not.toContain(restored);
  });

  // As an import from the sidebar, or an edit on Accounts, would leave
  // them: the current account renamed, deleted, or its id now a GIA's.
  it.each([
    [
      "renamed",
      accounts.map((account) =>
        account.id === 3 ? { ...account, name: "Joint account" } : account,
      ),
    ],
    ["deleted", accounts.filter(({ id }) => id !== 3)],
    [
      "of another kind",
      accounts.map((account) =>
        account.id === 3 ? { ...account, kind: "taxable" as const } : account,
      ),
    ],
  ])(
    "opens afresh where an account the draft touched is %s",
    (_how, changed) => {
      const view = drawWorksheet();
      commit(field("Current account"), "17,250");

      view.rerender(<MonthEnd {...opening} accounts={changed} />);

      expect(
        screen.getByText(`0 of ${String(changed.length)} checked`),
      ).toBeInTheDocument();
      expect(screen.queryByDisplayValue("£17,250")).not.toBeInTheDocument();

      reload(view, { accounts: changed });

      expect(screen.queryByDisplayValue("£17,250")).not.toBeInTheDocument();
      expect(notes()).not.toContain(restored);
    },
  );

  // A saver added mid-close, then the ISA's balance moved and dated, as
  // a pull leaves the house's: the £275,000 typed stands, and what it
  // was follows the balance.
  it("keeps the draft where an account is added, or a balance it touched moves", () => {
    const added = [
      ...accounts,
      { ...accounts[2], balance: 5000, id: 21, name: "Easy saver" },
    ];
    const { rerender } = drawWorksheet();
    commit(field("Stocks & shares ISA"), "275,000");

    rerender(<MonthEnd {...opening} accounts={added} />);

    expect(field("Stocks & shares ISA")).toHaveValue("£275,000");
    expect(screen.getByText("1 of 6 checked")).toBeInTheDocument();

    rerender(
      <MonthEnd
        {...opening}
        accounts={added.map((account) =>
          account.id === isa.id
            ? { ...account, balance: 272_500, setOn: "2026-10-03" }
            : account,
        )}
      />,
    );

    expect(field("Stocks & shares ISA")).toHaveValue("£275,000");
    expect(field("Stocks & shares ISA")).toHaveAccessibleDescription(
      "Was £272,500 · £1,667 paid in · £833 moved",
    );
  });

  // Started again, the worksheet opens as it does fresh and hands the
  // focus to the screen's title, so it reads from the top.
  it("starts again from what the plan expected, and erases the draft kept", () => {
    const { unmount } = drawWorksheet();
    commit(field("Stocks & shares ISA"), "275,000");
    unmount();
    render(<h1 tabIndex={-1}>September isn&apos;t closed yet</h1>);
    const view = drawWorksheet();

    fireEvent.click(screen.getByRole("button", { name: "Start again" }));

    expect(field("Stocks & shares ISA")).toHaveValue("£274,711");
    expect(screen.getByText("0 of 5 checked")).toBeInTheDocument();
    expect(notes()).not.toContain(restored);
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    expect(sessionStorage).toHaveLength(0);

    reload(view);

    expect(notes()).not.toContain(restored);
  });

  // The storage refuses the second figure: the worksheet keeps it, and
  // the first, kept before, is erased rather than left for a reload.
  it("keeps working where the storage refuses a draft, leaving nothing older to restore", async () => {
    vi.mocked(closeBalances).mockResolvedValue(
      saved({ asOf: { month: 8, year: 2026 }, isRecorded: true }),
    );
    const view = drawWorksheet();
    commit(field("Stocks & shares ISA"), "275,000");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException(
        "The quota has been exceeded.",
        "QuotaExceededError",
      );
    });

    commit(field("Stocks & shares ISA"), "276,000");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(field("Stocks & shares ISA")).toHaveValue("£276,000");
    expect(closeBalances).toHaveBeenCalledExactlyOnceWith({
      asOf: { month: 8, year: 2026 },
      balances: [{ balance: 276_000, id: isa.id }],
    });
    expect(sessionStorage).toHaveLength(0);
    await screen.findByRole("dialog", { name: "Balances updated" });

    reload(view);

    expect(field("Stocks & shares ISA")).toHaveValue("£274,711");
    expect(notes()).not.toContain(restored);
  });

  // Started again where the storage will not erase: the draft is held
  // empty, so the copy left is not read back in its place.
  it("starts again where the storage refuses to erase the draft", () => {
    const view = drawWorksheet();
    commit(field("Stocks & shares ISA"), "275,000");
    reload(view);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("The storage is turned off.", "SecurityError");
    });

    fireEvent.click(screen.getByRole("button", { name: "Start again" }));

    expect(field("Stocks & shares ISA")).toHaveValue("£274,711");
    expect(notes()).not.toContain(restored);
    expect(document.body).toHaveFocus();
  });

  it("opens afresh where the storage refuses to be read", () => {
    const view = drawWorksheet();
    commit(field("Stocks & shares ISA"), "275,000");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("The storage is turned off.", "SecurityError");
    });

    reload(view);

    expect(field("Stocks & shares ISA")).toHaveValue("£274,711");
    expect(notes()).not.toContain(restored);
  });

  it("opens and types where the tab has no storage at all", () => {
    vi.stubGlobal("sessionStorage", undefined);
    openWorksheet();

    commit(field("Stocks & shares ISA"), "275,000");

    expect(field("Stocks & shares ISA")).toHaveValue("£275,000");
  });

  it.each([
    ["not JSON", "{"],
    ["not a draft", JSON.stringify({ draft: { checked: [2] } })],
  ])("opens afresh where what the tab kept is %s", (_what, text) => {
    sessionStorage.setItem("month-end-draft", text);

    openWorksheet();

    expect(field("Stocks & shares ISA")).toHaveValue("£274,711");
    expect(notes()).not.toContain(restored);
  });
});
