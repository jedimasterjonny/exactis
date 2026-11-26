import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PortfolioHandoff } from "@/data/portfolio";
import type { Target, Targets } from "@/data/targets";

import { commit, field } from "@/test/dom";

import type { CogitatorPortfolio } from "./cogitator-screen";

import { CogitatorScreen } from "./cogitator-screen";

vi.mock("@/actions/targets", () => ({ syncTargetsFromPortfolio: vi.fn() }));

// An allocation of the categories given, synced on the seventh of
// September 2026.
function allocation(categories: readonly Target[]): Targets {
  return { categories, importedOn: "2026-09-07" };
}

// Builds a category-id lookup map without uppercase object literal keys.
function byCategory(
  entries: readonly (readonly [
    string,
    readonly {
      readonly heldInAccountIds: readonly string[];
      readonly id: string;
    }[],
  ])[],
): PortfolioHandoff["securitiesByCategory"] {
  return Object.fromEntries(entries);
}

// A synced owned portfolio with optional handoff lookups and freshness
// overrides.
function syncedPortfolio(
  handoff: PortfolioHandoff = {
    securitiesAccounts: [],
    securitiesByCategory: {},
  },
  {
    latestQuoteDate = "2026-09-07",
    savedOn = "2026-09-07",
  }: {
    readonly latestQuoteDate?: null | string;
    readonly savedOn?: string;
  } = {},
): CogitatorPortfolio {
  return { handoff, latestQuoteDate, savedOn, syncState: "synced" };
}

// A category by its name, its share of the whole and what it holds,
// with a fund assigned.
function target(name: string, share: number, value: number): Target {
  return { classes: [], id: name, isImplemented: true, name, share, value };
}

// A holds £1,000 of its 40%, B £3,000 of 30%, C £1,000 of 20% and D
// £450 of 10%, £5,450 in all. £2,000 in makes £7,450: A is £1,980
// short, C £490, D £295 and B £765 over. One trade puts it all into
// A; two bring A and C £235 short, £1,745 and £255; three would bring
// D level too but put only £40 into it.
const reference = allocation([
  target("A", 0.4, 1000),
  target("B", 0.3, 3000),
  target("C", 0.2, 1000),
  target("D", 0.1, 450),
]);

const defaultPortfolio = syncedPortfolio();

// The amount to invest typed and committed.
function invest(amount: string): void {
  commit(field("Amount to invest"), amount);
}

// The tile of the tone given, inverse for the one set apart.
function toned(tone: string): HTMLElement {
  return screen.getByText(
    (_content, element) => element?.getAttribute("data-tone") === tone,
  );
}

describe("CogitatorScreen", () => {
  // Read on the fifteenth, eight days after the latest quote date.
  it("heads the screen as the eighth, showing quote freshness, held total, and Open Portfolio", () => {
    render(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={reference}
        today="2026-09-15"
      />,
    );

    const header = screen.getByRole("banner");

    expect(screen.getByText("Sect. VIII · Cogitator")).toHaveClass("label");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Next best trades",
    );
    expect(
      within(header).getByText("Quotes to 7 Sep 2026 · 8 days old"),
    ).toBeInTheDocument();
    expect(within(header).getByText("£5,450 held")).toBeInTheDocument();
    expect(
      within(header).getByRole("link", { name: "Open Portfolio" }),
    ).toHaveAttribute("href", "/portfolio");
    expect(
      within(header).queryByRole("button", { name: "Sync from Portfolio" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows Saved freshness when no quotes exist and avoids negative age when a date is ahead of today", () => {
    const { rerender } = render(
      <CogitatorScreen
        branch={null}
        portfolio={syncedPortfolio(undefined, {
          latestQuoteDate: null,
          savedOn: "2026-09-07",
        })}
        targets={reference}
        today="2026-09-15"
      />,
    );

    expect(
      screen.getByText("Saved 7 Sep 2026 · 8 days old"),
    ).toBeInTheDocument();

    rerender(
      <CogitatorScreen
        branch={null}
        portfolio={syncedPortfolio(undefined, {
          latestQuoteDate: "2026-09-16",
          savedOn: "2026-09-16",
        })}
        targets={reference}
        today="2026-09-15"
      />,
    );

    expect(screen.getByText("Quotes to 16 Sep 2026")).toBeInTheDocument();
  });

  it("shows Synced freshness and Upload on Portfolio for legacy targets when no portfolio file is uploaded", () => {
    render(
      <CogitatorScreen
        branch={null}
        portfolio={null}
        targets={reference}
        today="2026-09-15"
      />,
    );

    const header = screen.getByRole("banner");

    expect(
      within(header).getByText("Synced 7 Sep 2026 · 8 days old"),
    ).toBeInTheDocument();
    expect(within(header).getByText("£5,450 held")).toBeInTheDocument();
    expect(
      within(header).getByRole("link", { name: "Upload on Portfolio" }),
    ).toHaveAttribute("href", "/portfolio");
  });

  it("cautions that the trades buy toward the target allocation's split while the plan holds another in bonds", () => {
    render(
      <CogitatorScreen
        bonds={{ now: 0.4, targeted: 0.3 }}
        branch={null}
        portfolio={defaultPortfolio}
        targets={reference}
        today="2026-09-15"
      />,
    );

    expect(screen.getByRole("note")).toHaveTextContent(
      "The target allocation holds 30% in bonds; the plan holds 40% nowThe trades buy toward the target allocation's split. Retarget on Assumptions › Target allocation to buy toward the plan's.",
    );
  });

  it("cautions when the owned portfolio file is refused, unsynced, or blocked by CMA rates, and suppresses unsynced cautions in a scenario", () => {
    const { rerender } = render(
      <CogitatorScreen
        branch={null}
        portfolio={{
          handoff: { securitiesAccounts: [], securitiesByCategory: {} },
          latestQuoteDate: "2026-09-07",
          savedOn: "2026-09-07",
          syncRefusal: "Missing Asset Allocation taxonomy",
          syncState: "refused",
        }}
        targets={reference}
        today="2026-09-15"
      />,
    );

    expect(screen.getByRole("note")).toHaveTextContent(
      "Portfolio file could not be syncedMissing Asset Allocation taxonomy",
    );

    rerender(
      <CogitatorScreen
        branch={null}
        portfolio={{
          handoff: { securitiesAccounts: [], securitiesByCategory: {} },
          latestQuoteDate: "2026-09-07",
          savedOn: "2026-09-07",
          syncState: "unsynced",
        }}
        targets={reference}
        today="2026-09-15"
      />,
    );

    expect(screen.getByRole("note")).toHaveTextContent(
      "Portfolio file has newer targets or holdingsSync from Portfolio to plan trades from the latest file.",
    );
    expect(
      screen.getByRole("button", { name: "Sync from Portfolio" }),
    ).toBeEnabled();

    rerender(
      <CogitatorScreen
        branch={null}
        portfolio={{
          blockedReason: "Map the new category before syncing.",
          handoff: { securitiesAccounts: [], securitiesByCategory: {} },
          latestQuoteDate: "2026-09-07",
          savedOn: "2026-09-07",
          syncState: "unsynced",
        }}
        targets={reference}
        today="2026-09-15"
      />,
    );

    const blockedButton = screen.getByRole("button", {
      name: "Sync from Portfolio",
    });

    expect(screen.getByRole("note")).toHaveTextContent(
      "Portfolio file has unsynced changesMap the new category before syncing.",
    );
    expect(blockedButton).toBeDisabled();
    expect(blockedButton).toHaveAccessibleDescription(
      "Portfolio file has unsynced changes Map the new category before syncing.",
    );

    rerender(
      <CogitatorScreen
        branch="Retire early"
        portfolio={{
          handoff: { securitiesAccounts: [], securitiesByCategory: {} },
          latestQuoteDate: "2026-09-07",
          savedOn: "2026-09-07",
          syncState: "unsynced",
        }}
        targets={reference}
        today="2026-09-15"
      />,
    );

    expect(screen.queryByRole("note")).not.toBeInTheDocument();

    rerender(
      <CogitatorScreen
        branch="Retire early"
        portfolio={{
          handoff: { securitiesAccounts: [], securitiesByCategory: {} },
          latestQuoteDate: "2026-09-07",
          savedOn: "2026-09-07",
          syncState: "retargeted",
        }}
        targets={reference}
        today="2026-09-15"
      />,
    );

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("asks to upload a portfolio file on Portfolio when neither file nor targets exist, with a 44px touch link", () => {
    render(
      <CogitatorScreen
        branch={null}
        portfolio={null}
        targets={null}
        today="2026-09-15"
      />,
    );

    const header = screen.getByRole("banner");
    const board = screen.getByRole("region", { name: "How many trades" });
    const link = within(board).getByRole("link", {
      name: "Upload on Portfolio",
    });

    expect(
      within(header).getByRole("link", { name: "Upload on Portfolio" }),
    ).toHaveAttribute("href", "/portfolio");
    expect(within(header).queryByText(/held$/u)).not.toBeInTheDocument();
    expect(within(header).queryByText(/^Synced /u)).not.toBeInTheDocument();
    expect(
      within(board).getByText("No portfolio file uploaded yet"),
    ).toBeInTheDocument();
    expect(
      within(board).getByText(
        "Upload a binary Portfolio Performance file on Portfolio to plan trades.",
      ),
    ).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/portfolio");
    expect(link).toHaveClass(
      "pointer-coarse:inline-flex",
      "pointer-coarse:min-h-11",
      "pointer-coarse:items-center",
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows the refusal inline without a duplicate caution when targets are missing and the portfolio file is refused", () => {
    render(
      <CogitatorScreen
        branch={null}
        portfolio={{
          handoff: { securitiesAccounts: [], securitiesByCategory: {} },
          latestQuoteDate: "2026-09-07",
          savedOn: "2026-09-07",
          syncRefusal: "No Asset Allocation taxonomy found.",
          syncState: "refused",
        }}
        targets={null}
        today="2026-09-15"
      />,
    );

    const board = screen.getByRole("region", { name: "How many trades" });

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(
      within(board).getByText("Portfolio file could not be synced"),
    ).toBeInTheDocument();
    expect(
      within(board).getByText("No Asset Allocation taxonomy found."),
    ).toBeInTheDocument();
    expect(
      within(board).getByRole("link", { name: "Open Portfolio" }),
    ).toHaveAttribute("href", "/portfolio");
  });

  it("offers inline Sync from Portfolio without a duplicate caution when a file is stored but no targets are synced yet", () => {
    render(
      <CogitatorScreen
        branch={null}
        portfolio={{
          handoff: { securitiesAccounts: [], securitiesByCategory: {} },
          latestQuoteDate: "2026-09-07",
          savedOn: "2026-09-07",
          syncState: "unsynced",
        }}
        targets={null}
        today="2026-09-15"
      />,
    );

    const board = screen.getByRole("region", { name: "How many trades" });

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(
      within(board).getByText("No allocation synced yet"),
    ).toBeInTheDocument();
    expect(
      within(board).getByText("Sync the stored portfolio file to plan trades."),
    ).toBeInTheDocument();
    expect(
      within(board).getByRole("button", { name: "Sync from Portfolio" }),
    ).toBeEnabled();
  });

  it("says nothing is held yet while every category holds nothing, pointing to Portfolio", () => {
    render(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={allocation([target("A", 0.6, 0), target("B", 0.4, 0)])}
        today="2026-09-15"
      />,
    );

    const board = screen.getByRole("region", { name: "How many trades" });

    expect(within(board).getByText("Nothing held yet")).toBeInTheDocument();
    expect(
      within(board).getByText("Record holdings or update quotes on Portfolio."),
    ).toBeInTheDocument();
    expect(
      within(board).getByRole("link", { name: "Open Portfolio" }),
    ).toHaveAttribute("href", "/portfolio");
    expect(screen.getByText("£0 held")).toBeInTheDocument();
  });

  it("says there is nothing to buy toward while no category has both a fund and a share, linking to Target allocation with a 44px touch target", () => {
    render(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={allocation([
          target("A", 0, 1000),
          { ...target("B", 1, 0), isImplemented: false },
        ])}
        today="2026-09-15"
      />,
    );

    const link = screen.getByRole("link", {
      name: "Assumptions › Target allocation",
    });

    expect(screen.getByText("Nothing to buy toward")).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/assumptions?tab=target-allocation");
    expect(link).toHaveClass(
      "pointer-coarse:inline-flex",
      "pointer-coarse:min-h-11",
      "pointer-coarse:items-center",
    );
  });

  it("asks for the amount before any is typed, omits trade handoff links on No trade, and reads the allocation as it stands", () => {
    render(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={reference}
        today="2026-09-15"
      />,
    );

    expect(screen.getAllByText("Type an amount to invest.")).toHaveLength(1);
    expect(screen.getAllByText("No trade")).toHaveLength(3);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Holds £1,000 · 18.35% → 18.35% of 40.00%"),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("link", { name: /^Record /u }),
    ).not.toBeInTheDocument();
  });

  it("tiles the trades recommended, the largest set apart, and lays the ladder with the rung recommended saying so and those past it muted", () => {
    render(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={reference}
        today="2026-09-15"
      />,
    );
    invest("2000");

    expect(toned("inverse")).toHaveTextContent("A£1,745");
    expect(toned("default")).toHaveTextContent("C£255");
    expect(screen.getByText("18.35% → 36.85% of 40.00%")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "2 trades. Trade 3 would put only £40 into D, under the £100 minimum.",
      ),
    ).toHaveLength(1);

    const ladder = screen.getByRole("region", { name: "How many trades" });
    const rows = within(ladder).getAllByRole("row").slice(1);

    expect(rows.map((row) => row.textContent)).toStrictEqual([
      expect.stringContaining("No trade"),
      expect.stringContaining("A £2,000"),
      expect.stringContaining("A £1,745 · C £255"),
      expect.stringContaining("A £1,725 · C £235 · D £40"),
    ]);
    expect(within(rows[2] ?? ladder).getAllByText("Recommended")).toHaveLength(
      2,
    );
    // The badge says it in its word and its tone, with no glyph beside
    // them, as the folded line does.
    const badge = within(rows[2] ?? ladder).getByText(
      (_content, element) =>
        element?.getAttribute("data-variant") === "positive",
    );
    expect(badge).toHaveTextContent("Recommended");
    // eslint-disable-next-line testing-library/no-node-access -- the glyph was an icon hidden from the tree, with no role or text of its own
    expect(badge.querySelector("svg")).toBeNull();
    expect(rows[3]).toHaveClass("text-muted-foreground");
    expect(rows[2]).not.toHaveClass("text-muted-foreground");
    expect(within(rows[0] ?? ladder).getAllByText("—")).not.toHaveLength(0);
    expect(within(rows[1] ?? ladder).getAllByText("+8.34pp")).toHaveLength(2);
  });

  it("builds purchase handoff links with unique account and security resolution, falling back to category and omitting ambiguous accounts", () => {
    const withAccounts = allocation([
      { ...target("A", 0.4, 1000), accounts: [{ name: "ISA", value: 1000 }] },
      { ...target("B", 0.3, 3000), accounts: [{ name: "ISA", value: 3000 }] },
      { ...target("C", 0.2, 1000), accounts: [{ name: "ISA", value: 1000 }] },
      { ...target("D", 0.1, 450), accounts: [{ name: "ISA", value: 450 }] },
    ]);
    const handoff: PortfolioHandoff = {
      securitiesAccounts: [{ id: "acc-isa", name: "ISA" }],
      securitiesByCategory: byCategory([
        ["A", [{ heldInAccountIds: ["acc-isa"], id: "sec-a" }]],
        [
          "C",
          [
            { heldInAccountIds: ["acc-isa"], id: "sec-c1" },
            { heldInAccountIds: ["acc-isa"], id: "sec-c2" },
          ],
        ],
      ]),
    };
    const { rerender } = render(
      <CogitatorScreen
        branch={null}
        offered={{
          account: "ISA",
          amount: 2000,
          month: { month: 7, year: 2026 },
        }}
        portfolio={syncedPortfolio(handoff)}
        targets={withAccounts}
        today="2026-09-15"
      />,
    );

    const buyA = screen.getByRole("link", {
      name: "Record purchase of A in Portfolio",
    });
    const buyC = screen.getByRole("link", {
      name: "Record purchase of C in Portfolio",
    });

    expect(buyA).toHaveTextContent("Record purchase");
    expect(buyA).toHaveAttribute(
      "href",
      "/portfolio?amount=1745&tab=transactions&trade=purchase&portfolio=acc-isa&security=sec-a",
    );
    expect(buyA).toHaveClass(
      "text-card-foreground",
      "focus-visible:outline-ring",
      "pointer-coarse:min-h-11",
    );
    expect(buyC).toHaveAttribute(
      "href",
      "/portfolio?amount=255&tab=transactions&trade=purchase&portfolio=acc-isa&category=C",
    );

    // Switching to All accounts omits portfolio while keeping security/category resolution.
    fireEvent.change(screen.getByRole("combobox", { name: "Account" }), {
      target: { value: "" },
    });

    expect(
      screen.getByRole("link", { name: "Record purchase of A in Portfolio" }),
    ).toHaveAttribute(
      "href",
      "/portfolio?amount=1745&tab=transactions&trade=purchase&security=sec-a",
    );

    // Duplicate account names and zero-security categories omit portfolio and fall back to category.
    fireEvent.change(screen.getByRole("combobox", { name: "Account" }), {
      target: { value: "ISA" },
    });
    rerender(
      <CogitatorScreen
        branch={null}
        offered={{
          account: "ISA",
          amount: 2000,
          month: { month: 7, year: 2026 },
        }}
        portfolio={syncedPortfolio({
          securitiesAccounts: [
            { id: "acc-isa-1", name: "ISA" },
            { id: "acc-isa-2", name: "ISA" },
          ],
          securitiesByCategory: {},
        })}
        targets={withAccounts}
        today="2026-09-15"
      />,
    );

    expect(
      screen.getByRole("link", { name: "Record purchase of A in Portfolio" }),
    ).toHaveAttribute(
      "href",
      "/portfolio?amount=1745&tab=transactions&trade=purchase&category=A",
    );
  });

  it("narrows sale handoff links to held securities in scope and falls back to all assigned securities when none are held", () => {
    const listed = allocation([
      { ...target("A", 0.5, 1000), accounts: [{ name: "ISA", value: 1000 }] },
      {
        ...target("B", 0.5, 3000),
        accounts: [
          { name: "ISA", value: 400 },
          { name: "GIA", value: 2600 },
        ],
      },
    ]);
    const { rerender } = render(
      <CogitatorScreen
        branch={null}
        portfolio={syncedPortfolio({
          securitiesAccounts: [
            { id: "acc-isa", name: "ISA" },
            { id: "acc-gia", name: "GIA" },
          ],
          securitiesByCategory: byCategory([
            ["A", [{ heldInAccountIds: ["acc-isa"], id: "sec-a" }]],
            [
              "B",
              [
                { heldInAccountIds: ["acc-isa"], id: "sec-b-isa" },
                { heldInAccountIds: ["acc-gia"], id: "sec-b-gia" },
              ],
            ],
          ]),
        })}
        targets={listed}
        today="2026-09-15"
      />,
    );
    commit(field("Sales at most"), "1");

    // Across all accounts, both B securities are held -> category=B.
    const sellAll = screen.getByRole("link", {
      name: "Record sale of B in Portfolio",
    });

    expect(sellAll).toHaveTextContent("Record sale");
    expect(sellAll).toHaveAttribute(
      "href",
      "/portfolio?amount=1000&tab=transactions&trade=sale&category=B",
    );

    // Selecting ISA narrows sale candidates to the one security held in acc-isa.
    fireEvent.change(screen.getByRole("combobox", { name: "Account" }), {
      target: { value: "ISA" },
    });

    expect(
      screen.getByRole("link", { name: "Record sale of B in Portfolio" }),
    ).toHaveAttribute(
      "href",
      "/portfolio?amount=400&tab=transactions&trade=sale&portfolio=acc-isa&security=sec-b-isa",
    );

    // Without an account selected, if only one assigned security is held anywhere, it narrows to that security.
    fireEvent.change(screen.getByRole("combobox", { name: "Account" }), {
      target: { value: "" },
    });
    rerender(
      <CogitatorScreen
        branch={null}
        portfolio={syncedPortfolio({
          securitiesAccounts: [{ id: "acc-isa", name: "ISA" }],
          securitiesByCategory: byCategory([
            ["A", [{ heldInAccountIds: ["acc-isa"], id: "sec-a" }]],
            [
              "B",
              [
                { heldInAccountIds: ["acc-isa"], id: "sec-b-held" },
                { heldInAccountIds: [], id: "sec-b-empty" },
              ],
            ],
          ]),
        })}
        targets={listed}
        today="2026-09-15"
      />,
    );

    expect(
      screen.getByRole("link", { name: "Record sale of B in Portfolio" }),
    ).toHaveAttribute(
      "href",
      "/portfolio?amount=1000&tab=transactions&trade=sale&security=sec-b-held",
    );

    // When no assigned security is held in scope, falls back to all assigned securities.
    rerender(
      <CogitatorScreen
        branch={null}
        portfolio={syncedPortfolio({
          securitiesAccounts: [{ id: "acc-isa", name: "ISA" }],
          securitiesByCategory: byCategory([
            ["A", [{ heldInAccountIds: ["acc-isa"], id: "sec-a" }]],
            ["B", [{ heldInAccountIds: [], id: "sec-b-sole" }]],
          ]),
        })}
        targets={listed}
        today="2026-09-15"
      />,
    );

    expect(
      screen.getByRole("link", { name: "Record sale of B in Portfolio" }),
    ).toHaveAttribute(
      "href",
      "/portfolio?amount=1000&tab=transactions&trade=sale&security=sec-b-sole",
    );
  });

  it("handles Object.prototype category ids safely and narrows duplicate-account sales to the matching accounts", () => {
    const prototypeTargets = allocation([
      {
        ...target("Global Equity", 0.5, 1000),
        accounts: [{ name: "ISA", value: 1000 }],
        id: "constructor",
      },
      {
        ...target("UK Gilts", 0.5, 3000),
        accounts: [
          { name: "ISA", value: 400 },
          { name: "GIA", value: 2600 },
        ],
        id: "toString",
      },
    ]);
    const { unmount } = render(
      <CogitatorScreen
        branch={null}
        offered={{ amount: 2000, month: { month: 7, year: 2026 } }}
        portfolio={syncedPortfolio({
          securitiesAccounts: [{ id: "acc-isa", name: "ISA" }],
          securitiesByCategory: {},
        })}
        targets={prototypeTargets}
        today="2026-09-15"
      />,
    );

    expect(
      screen.getByRole("link", {
        name: "Record purchase of Global Equity in Portfolio",
      }),
    ).toHaveAttribute(
      "href",
      "/portfolio?amount=2000&tab=transactions&trade=purchase&category=constructor",
    );

    unmount();

    const duplicateAccountTargets = allocation([
      { ...target("A", 0.5, 1000), accounts: [{ name: "ISA", value: 1000 }] },
      {
        ...target("B", 0.5, 3000),
        accounts: [
          { name: "ISA", value: 400 },
          { name: "GIA", value: 2600 },
        ],
      },
    ]);
    render(
      <CogitatorScreen
        branch={null}
        portfolio={syncedPortfolio({
          securitiesAccounts: [
            { id: "acc-isa-1", name: "ISA" },
            { id: "acc-isa-2", name: "ISA" },
            { id: "acc-gia", name: "GIA" },
          ],
          securitiesByCategory: byCategory([
            ["A", [{ heldInAccountIds: ["acc-isa-1"], id: "sec-a" }]],
            [
              "B",
              [
                { heldInAccountIds: ["acc-isa-2"], id: "sec-b-isa" },
                { heldInAccountIds: ["acc-gia"], id: "sec-b-gia" },
              ],
            ],
          ]),
        })}
        targets={duplicateAccountTargets}
        today="2026-09-15"
      />,
    );
    commit(field("Sales at most"), "1");
    fireEvent.change(screen.getByRole("combobox", { name: "Account" }), {
      target: { value: "ISA" },
    });

    // Two active accounts share "ISA", so portfolio is omitted while the
    // sale narrows strictly to securities held in those two ISA accounts,
    // ignoring sec-b-gia held only in the unrelated GIA account.
    expect(
      screen.getByRole("link", { name: "Record sale of B in Portfolio" }),
    ).toHaveAttribute(
      "href",
      "/portfolio?amount=400&tab=transactions&trade=sale&security=sec-b-isa",
    );
  });

  it("hides trade handoff links while a scenario is open or when no portfolio file is stored", () => {
    const { rerender } = render(
      <CogitatorScreen
        branch="Retire early"
        offered={{ amount: 2000, month: { month: 7, year: 2026 } }}
        portfolio={defaultPortfolio}
        targets={reference}
        today="2026-09-15"
      />,
    );

    expect(
      screen.queryByRole("link", { name: /^Record /u }),
    ).not.toBeInTheDocument();

    rerender(
      <CogitatorScreen
        branch={null}
        offered={{ amount: 2000, month: { month: 7, year: 2026 } }}
        portfolio={null}
        targets={reference}
        today="2026-09-15"
      />,
    );

    expect(
      screen.queryByRole("link", { name: /^Record /u }),
    ).not.toBeInTheDocument();
  });

  it("recommends no trade for an amount under the minimum, saying what the first would put in", () => {
    render(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={reference}
        today="2026-09-15"
      />,
    );
    invest("50");

    expect(toned("inverse")).toHaveTextContent(
      "No trade. Trade 1 would put only £50 into A, under the £100 minimum.",
    );
  });

  // Nothing is said as the screen opens; each commit says what the tiles
  // now lay, a sale as what it takes out, and an amount cleared back to
  // the one the screen opened on is said too, since the tiles changed.
  it("says the trades to a screen reader once an amount or a sale is committed, and not before", () => {
    render(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={allocation([
          target("A", 0.5, 1000),
          target("B", 0.25, 1500),
          target("C", 0.25, 950),
        ])}
        today="2026-09-15"
      />,
    );

    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    commit(field("Sales at most"), "2");

    expect(screen.getByRole("status")).toHaveTextContent(
      "2 trades: £637 into A and £637 out of B.",
    );

    commit(field("Sales at most"), "0");

    expect(screen.getByRole("status")).toHaveTextContent(
      "No trade. Type an amount to invest.",
    );
  });

  it("says no trade to a screen reader in the No-trade tile's words", () => {
    render(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={reference}
        today="2026-09-15"
      />,
    );
    invest("2000");

    expect(screen.getByRole("status")).toHaveTextContent(
      "2 trades: £1,745 into A and £255 into C.",
    );

    invest("50");

    expect(screen.getByRole("status")).toHaveTextContent(
      "No trade. Trade 1 would put only £50 into A, under the £100 minimum.",
    );
  });

  // The month end offered £2,000, which the tiles lay as the screen
  // opens, unsaid.
  it("says nothing as the screen opens on an amount offered", () => {
    render(
      <CogitatorScreen
        branch={null}
        offered={{ amount: 2000, month: { month: 7, year: 2026 } }}
        portfolio={defaultPortfolio}
        targets={reference}
        today="2026-09-15"
      />,
    );

    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("names the first of trades the next rung would put the same into", () => {
    render(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={allocation([target("A", 0.5, 1000), target("B", 0.5, 1000)])}
        today="2026-09-15"
      />,
    );
    invest("100");

    expect(
      screen.getAllByText(
        "1 trade. Trade 2 would put only £50 into A, under the £100 minimum.",
      ),
    ).toHaveLength(1);
  });

  it("says the next trade would bring the allocation no nearer where every other category holds its target", () => {
    render(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={allocation([target("A", 0.5, 2000), target("B", 0.5, 3000)])}
        today="2026-09-15"
      />,
    );
    invest("1000");

    expect(
      screen.getAllByText("1 trade. Trade 2 would bring it no nearer."),
    ).toHaveLength(1);
  });

  // A holds £1,000 of its 50%, B £1,500 of 25% and C £950 of 25%, with
  // nothing coming in: two trades sell the £637 B stands over into A;
  // three would bring all three to target but sell only £87 of C.
  it("sells to buy up to the sales typed with no amount, recommending as many sales as are worth placing", () => {
    render(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={allocation([
          target("A", 0.5, 1000),
          target("B", 0.25, 1500),
          target("C", 0.25, 950),
        ])}
        today="2026-09-15"
      />,
    );
    commit(field("Sales at most"), "2");

    expect(toned("inverse")).toHaveTextContent("A£637");
    expect(toned("default")).toHaveTextContent("B−£637");
    expect(screen.getByText("43.48% → 25.01% of 25.00%")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "2 trades. Trade 3 would sell only £87 of C, under the £100 minimum.",
      ),
    ).toHaveLength(1);

    const ladder = screen.getByRole("region", { name: "How many trades" });
    const rows = within(ladder).getAllByRole("row").slice(1);

    expect(rows.map((row) => row.textContent)).toStrictEqual([
      expect.stringContaining("No trade"),
      expect.stringContaining("A £637 · B −£637"),
      expect.stringContaining("A £724 · B −£637 · C −£87"),
    ]);

    const ledger = screen.getByRole("region", {
      name: "Where it leaves the allocation",
    });

    expect(within(ledger).getAllByRole("row")[2]).toHaveTextContent(
      "B£1,50043.48%−£63725.01%25.00%",
    );
  });

  // A holds £1,000 of its half and B £1,500 of its half. £50 in makes
  // £2,550: one trade puts the £50 into A, under the minimum; two sell
  // the £225 B stands over into A, both over it.
  it("mutes a rung below the one recommended with a trade under the minimum", () => {
    render(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={allocation([target("A", 0.5, 1000), target("B", 0.5, 1500)])}
        today="2026-09-15"
      />,
    );
    invest("50");
    commit(field("Sales at most"), "1");

    const ladder = screen.getByRole("region", { name: "How many trades" });
    const rows = within(ladder).getAllByRole("row").slice(1);

    expect(rows.map((row) => row.textContent)).toStrictEqual([
      expect.stringContaining("No trade"),
      expect.stringContaining("A £50"),
      expect.stringContaining("A £275 · B −£225"),
    ]);
    expect(rows[1]).toHaveClass("text-muted-foreground");
    expect(rows[2]).not.toHaveClass("text-muted-foreground");
  });

  // August's close offered the £2,000; typed over, the field still says
  // what was offered.
  it("opens on the amount a month end offered, saying so and what it was however it is typed over", () => {
    render(
      <CogitatorScreen
        branch={null}
        offered={{ amount: 2000, month: { month: 7, year: 2026 } }}
        portfolio={defaultPortfolio}
        targets={reference}
        today="2026-09-15"
      />,
    );

    expect(field("Amount to invest")).toHaveValue("£2,000");
    expect(field("Amount to invest")).toHaveAccessibleDescription(
      "£2,000 from August's close",
    );
    expect(toned("inverse")).toHaveTextContent("£1,745");

    invest("1,500");

    expect(field("Amount to invest")).toHaveAccessibleDescription(
      "£2,000 from August's close",
    );
  });

  // jsdom lays nothing out, so the class that lines the fields up is read.
  it("lines the header's fields up by their labels while the amount holds a hint", () => {
    render(
      <CogitatorScreen
        branch={null}
        offered={{ amount: 2000, month: { month: 7, year: 2026 } }}
        portfolio={defaultPortfolio}
        targets={reference}
        today="2026-09-15"
      />,
    );

    const label = screen.getByText("Amount to invest");
    // eslint-disable-next-line testing-library/no-node-access -- the row is the label's field's parent and has no role or text of its own to query by
    const row = label.parentElement?.parentElement;

    expect(row).toContainElement(field("Sales at most"));
    expect(row).toHaveClass("items-start");
  });

  // The plan pays the £2,000 into the ISAs and GIA in September, its
  // first month; typed over, the field still says what the plan pays.
  it("opens on what the plan pays into the ISAs and GIA in its first month, saying so and what it is however it is typed over", () => {
    render(
      <CogitatorScreen
        branch={null}
        planned={{ amount: 2000, month: { month: 8, year: 2026 } }}
        portfolio={defaultPortfolio}
        targets={reference}
        today="2026-09-15"
      />,
    );

    expect(field("Amount to invest")).toHaveValue("£2,000");
    expect(field("Amount to invest")).toHaveAccessibleDescription(
      "£2,000 planned for the ISAs and GIA in September",
    );
    expect(toned("inverse")).toHaveTextContent("A£1,745");

    invest("1,500");

    expect(field("Amount to invest")).toHaveAccessibleDescription(
      "£2,000 planned for the ISAs and GIA in September",
    );
  });

  it("shows the amount and sales held when their fields come back", () => {
    const { rerender } = render(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={reference}
        today="2026-09-15"
      />,
    );
    invest("2000");
    commit(field("Sales at most"), "3");
    rerender(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={null}
        today="2026-09-15"
      />,
    );
    rerender(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={reference}
        today="2026-09-15"
      />,
    );

    expect(field("Amount to invest")).toHaveValue("£2,000");
    expect(field("Sales at most")).toHaveValue("3");
  });

  // A holds £1,000 of its half, all in ISA, and B £3,000 of its half,
  // £400 in ISA and £2,600 in GIA. With nothing coming in and one sale,
  // every account together sells £1,000 of B into A; ISA can sell only
  // its £400 of B, and GIA its £1,000.
  it("places the trades in the account chosen, holding each sale to what it holds there, the accounts listed by name", () => {
    render(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={allocation([
          {
            ...target("A", 0.5, 1000),
            accounts: [{ name: "ISA", value: 1000 }],
          },
          {
            ...target("B", 0.5, 3000),
            accounts: [
              { name: "ISA", value: 400 },
              { name: "GIA", value: 2600 },
            ],
          },
        ])}
        today="2026-09-15"
      />,
    );
    commit(field("Sales at most"), "1");

    const menu = screen.getByRole("combobox", { name: "Account" });

    expect(
      within(menu)
        .getAllByRole("option")
        .map(({ textContent }) => textContent),
    ).toStrictEqual(["All accounts", "GIA", "ISA"]);
    expect(toned("default")).toHaveTextContent("B−£1,000");

    fireEvent.change(menu, { target: { value: "ISA" } });

    expect(toned("inverse")).toHaveTextContent("A£400");
    expect(toned("default")).toHaveTextContent("B−£400");

    fireEvent.change(menu, { target: { value: "GIA" } });

    expect(toned("default")).toHaveTextContent("B−£1,000");
  });

  it("trades in every account again once the account chosen is no longer listed, and offers none with no name", () => {
    const listed = (accounts: readonly string[]): Targets =>
      allocation([
        target("A", 0.5, 1000),
        {
          ...target("B", 0.5, 3000),
          accounts: accounts.map((name) => ({ name, value: 400 })),
        },
      ]);
    const { rerender } = render(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={listed(["ISA", ""])}
        today="2026-09-15"
      />,
    );
    commit(field("Sales at most"), "1");

    const menu = screen.getByRole("combobox", { name: "Account" });

    expect(
      within(menu)
        .getAllByRole("option")
        .map(({ textContent }) => textContent),
    ).toStrictEqual(["All accounts", "ISA"]);

    fireEvent.change(menu, { target: { value: "ISA" } });

    expect(toned("default")).toHaveTextContent("B−£400");

    rerender(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={listed(["GIA"])}
        today="2026-09-15"
      />,
    );

    expect(toned("default")).toHaveTextContent("B−£1,000");

    rerender(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={allocation([target("A", 1, 1000)])}
        today="2026-09-15"
      />,
    );
    rerender(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={listed(["ISA"])}
        today="2026-09-15"
      />,
    );

    expect(screen.getByRole("combobox", { name: "Account" })).toHaveValue("");
    expect(toned("default")).toHaveTextContent("B−£1,000");
  });

  // The month end offers £400 in the ISA, then in an account the
  // allocation does not list.
  it("opens the account choice on the account an amount was offered in, or on every account where it is not listed", () => {
    const listed = allocation([
      target("A", 0.5, 1000),
      { ...target("B", 0.5, 3000), accounts: [{ name: "ISA", value: 400 }] },
    ]);
    const month = { month: 8, year: 2026 };
    const { unmount } = render(
      <CogitatorScreen
        branch={null}
        offered={{ account: "ISA", amount: 400, month }}
        portfolio={defaultPortfolio}
        targets={listed}
        today="2026-09-15"
      />,
    );

    expect(screen.getByRole("combobox", { name: "Account" })).toHaveValue(
      "ISA",
    );

    unmount();
    render(
      <CogitatorScreen
        branch={null}
        offered={{ account: "Pension", amount: 400, month }}
        portfolio={defaultPortfolio}
        targets={listed}
        today="2026-09-15"
      />,
    );

    expect(screen.getByRole("combobox", { name: "Account" })).toHaveValue("");
  });

  it("opens the account choice on the account held when it comes back after the allocation had nothing to buy toward", () => {
    const listed = allocation([
      target("A", 0.5, 1000),
      { ...target("B", 0.5, 3000), accounts: [{ name: "ISA", value: 400 }] },
    ]);
    const { rerender } = render(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={listed}
        today="2026-09-15"
      />,
    );
    commit(field("Sales at most"), "1");
    fireEvent.change(screen.getByRole("combobox", { name: "Account" }), {
      target: { value: "ISA" },
    });
    rerender(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={allocation([
          { ...target("A", 0, 1000), accounts: [{ name: "ISA", value: 1000 }] },
          { ...target("B", 1, 0), isImplemented: false },
        ])}
        today="2026-09-15"
      />,
    );

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    rerender(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={listed}
        today="2026-09-15"
      />,
    );

    expect(screen.getByRole("combobox", { name: "Account" })).toHaveValue(
      "ISA",
    );
    expect(toned("default")).toHaveTextContent("B−£400");
  });

  it("ledgers each category's holding, its share now and after the trades, and its target, flagging one with no fund and muting a target of nothing", () => {
    render(
      <CogitatorScreen
        branch={null}
        portfolio={defaultPortfolio}
        targets={allocation([
          target("A", 0.5, 2000),
          target("B", 0, 1000),
          { ...target("C", 0.5, 1000), isImplemented: false },
        ])}
        today="2026-09-15"
      />,
    );
    invest("1000");

    const ledger = screen.getByRole("region", {
      name: "Where it leaves the allocation",
    });
    const rows = within(ledger).getAllByRole("row").slice(1);

    expect(rows[0]).toHaveTextContent("A£2,00050.00%£1,00060.00%50.00%");
    expect(rows[1]).toHaveTextContent("B£1,00025.00%—20.00%0.00%");
    expect(rows[2]).toHaveTextContent("No fund assigned");
    expect(
      within(rows[1] ?? ledger).getByRole("cell", { name: "0.00%" }),
    ).toHaveClass("text-muted-foreground");
    expect(
      within(rows[2] ?? ledger).getAllByText("No fund assigned"),
    ).toHaveLength(2);
  });
});
