import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Kept } from "@/data/household";
import type { KeptClose, Landed, Landing } from "@/lib/landed";
import type { Moved } from "@/lib/moved";

import { closeBalances } from "@/actions/accounts";
import { soundKept } from "@/data/household";
import { kept } from "@/data/household.fixture";
import { portfolios, targets } from "@/data/targets.fixture";
import { Refusal, refused, saved } from "@/lib/answer";
import { landedSince } from "@/lib/landed";
import { movedOver, movedSince } from "@/lib/moved";
import {
  getClosesBack,
  getHousehold,
  getOpened,
  getSinceClose,
} from "@/store/household";

import Close from "./page";

const replace = vi.hoisted(() => vi.fn());

vi.mock("@/store/household", () => ({
  getClosesBack: vi.fn(),
  getHousehold: vi.fn(),
  getOpened: vi.fn(),
  getSinceClose: vi.fn(),
}));
vi.mock("@/actions/accounts", () => ({ closeBalances: vi.fn() }));
vi.mock("@/actions/targets", () => ({ importTargets: vi.fn() }));
// The reading stood in for, and the band it is named by kept as it is,
// since the screen says it.
vi.mock(import("@/lib/landed"), async (importOriginal) => ({
  ...(await importOriginal()),
  landedSince: vi.fn(),
}));
// The walks stood in for, and the names of what they walk kept as they
// are, since the screen says them.
vi.mock(import("@/lib/moved"), async (importOriginal) => ({
  ...(await importOriginal()),
  movedOver: vi.fn(),
  movedSince: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: (): { readonly replace: typeof replace } => ({ replace }),
}));

// The reference household as the close of July 2026 left it.
const july: Kept = {
  ...kept,
  asOf: { month: 6, year: 2026 },
  points: kept.points.slice(0, -1),
};

// What moved the reference household since July's close, invented: the
// owner, born in 1992, expected to retire in 2053, at 61, with £600,000
// liquid then; the balances £2,140 ahead of the £900,000 expected, one
// left unchecked; then the rates and the household's own changes, the
// stocks rate and the glide path, an expense line and the accounts.
const moved: Moved = {
  age: 61,
  balances: {
    actual: [],
    expected: 900_000,
    moved: 3000,
    now: 902_140,
    paid: 1500,
    planned: 1500,
    stood: 897_640,
    unchecked: 1,
  },
  changes: ["accounts", "schedule"],
  expected: { liquid: 600_000, retired: 2053 },
  invested: 1250,
  months: 1,
  now: { liquid: 590_500, retired: 2053 },
  rates: ["glide", "rates", "cma"],
  steps: [
    { groups: ["balances"], standing: { liquid: 605_000, retired: 2053 } },
    { groups: ["rates"], standing: { liquid: 580_000, retired: 2053 } },
    { groups: ["changes"], standing: { liquid: 590_500, retired: 2053 } },
  ],
};

// Where the invested balances landed since July's close, invented: a
// month on, in the middle half of its futures, above 46% of them, the
// ISA paid £300 more than the plan paid it, as Portfolio Performance
// says, and one of three invested balances left out.
const landed: Landed = {
  actual: 190_412,
  asOf: { month: 6, year: 2026 },
  bands: {
    bottomQuarter: 185_600,
    bottomTenth: 180_400,
    middle: 191_250,
    topQuarter: 196_800,
    topTenth: 202_100,
  },
  beyond: 300,
  isDrawing: false,
  left: 1,
  months: 1,
  paidBy: ["Stocks & shares ISA"],
  read: 2,
  share: 0.46,
};

// The closes kept in the year before August's as reads already
// answered: none, and July's. Each is marked the way React marks a
// promise it has seen settle, so the card draws from it at once, as the
// request's boundary does once the read is in, rather than suspending
// inside a render the test cannot await.
const noCloses: readonly KeptClose[] = [];
const unclosed = Object.assign(Promise.resolve(noCloses), {
  status: "fulfilled",
  value: noCloses,
});
const julyCloses: readonly KeptClose[] = [
  { before: saved(soundKept(july)), month: july.asOf },
];
const julyClosed = Object.assign(Promise.resolve(julyCloses), {
  status: "fulfilled",
  value: julyCloses,
});

// The line beneath a row of what moved, which describes its name.
function detail(name: string): HTMLElement {
  return screen.getByRole("rowheader", { name });
}

// The card where the invested balances landed, once it is drawn: its
// caption, where it has one, and its lines.
function landing(): {
  readonly caption: null | string;
  readonly lines: readonly (null | string)[];
} {
  const card = screen.getByRole("region", {
    name: "Where the invested balances landed",
  });
  return {
    caption:
      within(card).queryByText(/^Since the close of/u)?.textContent ?? null,
    lines: within(card)
      .getAllByRole("paragraph")
      .map((line) => line.textContent),
  };
}

// The links of the trades' card, each its name and where it goes.
function links(): (null | string)[][] {
  return within(screen.getByRole("region", { name: "Trades" }))
    .getAllByRole("link")
    .map((link) => [link.textContent, link.getAttribute("href")]);
}

// The month end at the address given on the day given, over the
// household given, as the store reads it, with a scenario open where one
// is named, the close before the latest as given, and the closes kept in
// the year before the latest as given, read once the page is drawn.
async function renderClose({
  address = {},
  closes = unclosed,
  day = "2026-09-15",
  household = kept,
  scenario = null,
  since = { balances: null, before: saved(july), now: kept },
}: {
  readonly address?: Record<string, string>;
  readonly closes?: Promise<readonly KeptClose[]>;
  readonly day?: string;
  readonly household?: Kept;
  readonly scenario?: null | string;
  readonly since?: Awaited<ReturnType<typeof getSinceClose>>;
} = {}): Promise<void> {
  vi.useFakeTimers({ now: new Date(`${day}T12:00:00Z`), toFake: ["Date"] });
  vi.mocked(getHousehold).mockResolvedValue(soundKept(household).household);
  vi.mocked(getOpened).mockResolvedValue(
    scenario === null ? null : { isKept: true, name: scenario },
  );
  vi.mocked(getSinceClose).mockResolvedValue(since);
  vi.mocked(getClosesBack).mockReturnValue(closes);
  const page = await Close({ searchParams: Promise.resolve(address) });
  render(page);
}

// The rows of what moved, each its name and its figures.
function rows(): (null | string)[][] {
  return within(
    screen.getByRole("table", { name: "What moved the plan, worked out" }),
  )
    .getAllByRole("row")
    .slice(1)
    .map((row) => [
      within(row).getByRole("rowheader").textContent,
      ...within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ]);
}

// The lines of the trades' card.
function trades(): (null | string)[] {
  return within(screen.getByRole("region", { name: "Trades" }))
    .getAllByRole("paragraph")
    .map((line) => line.textContent);
}

// Where the header's link to update the balances goes.
function updating(): null | string {
  return within(screen.getByRole("banner"))
    .getByRole("link", { name: "Update balances" })
    .getAttribute("href");
}

describe("Close", () => {
  beforeEach(() => {
    vi.mocked(movedSince).mockReturnValue(moved);
    vi.mocked(landedSince).mockReturnValue({ landed: null, passed: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // August's point is the latest, and on the fifteenth of September
  // August is the month cut last.
  it("says what moved the plan since the close before, under a title that gives the answer", async () => {
    await renderClose();

    expect(screen.getByText("Sect. VII · Month end")).toHaveClass("label");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "August closed £2,140 ahead of plan; retirement still at 61",
    );
    expect(
      screen.getByText(
        "Mostly rates and their sources · September closes from 25 September",
      ),
    ).toBeInTheDocument();
    expect(movedSince).toHaveBeenCalledExactlyOnceWith(july, kept);
    expect(updating()).toBe("/close?update");

    const balances = screen.getByRole("region", {
      name: "Balances on 25 Aug 2026",
    });
    expect(within(balances).getByText("Sect. VII.i")).toHaveClass("label");
    expect(
      within(balances).getByText("1 balance left as it stood"),
    ).toBeInTheDocument();
    expect(
      within(balances)
        .getAllByRole("listitem")
        .map((step) => step.textContent),
    ).toStrictEqual([
      "As the balances stood24 Jul 2026£897,640",
      "Paid in£1,500",
      "MovedMarkets, interest and the unexpected£3,000",
    ]);
    expect(within(balances).getByText("£902,140")).toBeInTheDocument();

    const what = screen.getByRole("region", { name: "What moved" });
    expect(
      within(what).getByText("Since the close of July 2026"),
    ).toBeInTheDocument();
    expect(
      within(what).getByRole("columnheader", { name: "Liquid at 61" }),
    ).toBeInTheDocument();
    expect(rows()).toStrictEqual([
      ["As the month end expected", "61", "£600,000"],
      ["Balances against the plan", "Unchanged", "+£5,000"],
      ["Rates and their sources", "Unchanged", "−£25,000"],
      ["Your changes", "Unchanged", "+£10,500"],
      ["Now", "61", "£590,500"],
    ]);
    expect(detail("As the month end expected")).toHaveAccessibleDescription(
      "July 2026's balances carried 1 month on as the plan expected",
    );
    expect(detail("Balances against the plan")).toHaveAccessibleDescription(
      "£2,140 above what was expected · £1,500 paid in · £3,000 moved · 1 balance left unchecked",
    );
    expect(detail("Rates and their sources")).toHaveAccessibleDescription(
      "Rates typed, BlackRock CMA · Glide path",
    );
    expect(detail("Your changes")).toHaveAccessibleDescription(
      "Accounts, Income & expenses",
    );
    expect(within(what).getByRole("paragraph")).toHaveTextContent(
      /^Each row is worked out after the ones above it/,
    );

    expect(trades()).toStrictEqual([
      "The plan paid £1,250 into the ISAs and GIA in August 2026.",
    ]);
    expect(links()).toStrictEqual([
      ["Work out trades for £1,250", "/cogitator?amount=1250&from=2026-08"],
      ["Choose an amount", "/cogitator"],
    ]);
  });

  // Of the £1,500 paid in, what Portfolio Performance says was paid into
  // the ISA and the pension stands in for the plan's £1,800.
  it("says what was paid in against what the plan paid, and which accounts Portfolio Performance said it of", async () => {
    vi.mocked(movedSince).mockReturnValue({
      ...moved,
      balances: {
        ...moved.balances,
        actual: ["Stocks & shares ISA", "Workplace pension"],
        planned: 1800,
      },
    });
    await renderClose();

    expect(
      within(screen.getByRole("region", { name: "Balances on 25 Aug 2026" }))
        .getAllByRole("listitem")
        .map((step) => step.textContent),
    ).toContain(
      "Paid in£1,800 planned · Stocks & shares ISA, Workplace pension from Portfolio Performance£1,500",
    );
    expect(detail("Balances against the plan")).toHaveAccessibleDescription(
      "£2,140 above what was expected · £1,500 paid in against £1,800 planned · £3,000 moved · 1 balance left unchecked",
    );
  });

  // The fixture's ISA and brokerage account hold cash uninvested, and
  // its pension none; its allocation lists only the brokerage account.
  it("offers trades for the cash each account the allocation lists holds uninvested, in that account", async () => {
    await renderClose({
      household: { ...kept, targets: { ...targets, portfolios } },
    });

    expect(trades()).toStrictEqual([
      "The plan paid £1,250 into the ISAs and GIA in August 2026.",
      "Portfolio Performance holds £1,830 in Stocks & shares ISA, £64 in Brokerage uninvested.",
    ]);
    expect(links()).toStrictEqual([
      [
        "Work out trades for £64 in Brokerage",
        "/cogitator?account=Brokerage&amount=64&from=2026-08",
      ],
      ["Choose an amount", "/cogitator"],
    ]);
  });

  it("offers what the plan paid in where the file gave no account's cash", async () => {
    await renderClose({
      household: { ...kept, targets: { ...targets, portfolios: [] } },
    });

    expect(trades()).toStrictEqual([
      "The plan paid £1,250 into the ISAs and GIA in August 2026.",
    ]);
    expect(links()).toStrictEqual([
      ["Work out trades for £1,250", "/cogitator?amount=1250&from=2026-08"],
      ["Choose an amount", "/cogitator"],
    ]);
  });

  // An allocation read before the accounts holding each category were.
  it("offers no account's cash in trades where the allocation lists no account", async () => {
    await renderClose({
      household: {
        ...kept,
        targets: {
          ...targets,
          categories: targets.categories.map(
            ({ classes, id, isImplemented, name, share, value }) => ({
              classes,
              id,
              isImplemented,
              name,
              share,
              value,
            }),
          ),
          portfolios,
        },
      },
    });

    expect(trades()).toContain(
      "Portfolio Performance holds £1,830 in Stocks & shares ISA, £64 in Brokerage uninvested.",
    );
    expect(links()).toStrictEqual([["Choose an amount", "/cogitator"]]);
  });

  it("offers no account's cash where none holds any uninvested", async () => {
    await renderClose({
      household: {
        ...kept,
        targets: {
          ...targets,
          portfolios: portfolios.map((each) => ({ ...each, cash: 0 })),
        },
      },
    });

    expect(trades()).toContain(
      "Portfolio Performance holds no cash uninvested.",
    );
    expect(links()).toStrictEqual([["Choose an amount", "/cogitator"]]);
  });

  // September closed, on the fifteenth of October, over holdings
  // imported on the seventh of September, before September was cut.
  it("asks for this month's holdings, from the file, where they were imported before the month closed was cut", async () => {
    await renderClose({
      day: "2026-10-15",
      household: {
        ...kept,
        asOf: { month: 8, year: 2026 },
        points: [
          ...kept.points,
          ...kept.points
            .slice(-1)
            .map((point) => ({ ...point, month: { month: 8, year: 2026 } })),
        ],
      },
    });

    expect(trades()).toStrictEqual([
      "The plan paid £1,250 into the ISAs and GIA in September 2026.",
      "Import this month's holdings first.",
    ]);
    expect(links()).toStrictEqual([["Choose an amount", "/cogitator"]]);
    expect(
      within(screen.getByRole("region", { name: "Trades" })).getByRole(
        "button",
        { name: "Import from Portfolio Performance" },
      ),
    ).toBeInTheDocument();
  });

  it("asks for holdings where none are imported, over the months since the close before", async () => {
    vi.mocked(movedSince).mockReturnValue({ ...moved, months: 3 });
    await renderClose({ household: { ...kept, targets: null } });

    expect(trades()).toStrictEqual([
      "The plan paid £1,250 into the ISAs and GIA in the 3 months to August 2026.",
      "Import this month's holdings first.",
    ]);
  });

  // Nothing moved: the title says the month went to plan, the meta line
  // only when the next close is due, the worksheet the expected standing
  // and the same now, and nothing was paid in to trade.
  it("says the month went to plan where nothing moved it", async () => {
    vi.mocked(movedSince).mockReturnValue({
      ...moved,
      balances: { ...moved.balances, now: 900_000, unchecked: 0 },
      invested: 0,
      now: moved.expected,
      steps: [],
    });
    await renderClose();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "August went to plan; retirement still at 61",
    );
    expect(
      screen.getByText("September closes from 25 September"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/left as it stood$/)).not.toBeInTheDocument();
    expect(rows().map(([name]) => name)).toStrictEqual([
      "As the month end expected",
      "Now",
    ]);
    expect(trades()).toStrictEqual([
      "The plan paid nothing into the ISAs and GIA in August 2026.",
    ]);
    expect(links()).toStrictEqual([["Choose an amount", "/cogitator"]]);
  });

  // The balances behind plan and folded into the changes, with nothing
  // left unchecked.
  it("says how far the balances closed behind plan, and names the groups a step took together", async () => {
    vi.mocked(movedSince).mockReturnValue({
      ...moved,
      balances: { ...moved.balances, now: 898_000, unchecked: 0 },
      steps: [
        {
          groups: ["balances", "changes"],
          standing: { liquid: 590_500, retired: 2053 },
        },
      ],
    });
    await renderClose();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "August closed £2,000 behind plan; retirement still at 61",
    );
    expect(rows()[1]).toStrictEqual([
      "Balances against the plan and your changes",
      "Unchanged",
      "−£9,500",
    ]);
    expect(
      detail("Balances against the plan and your changes"),
    ).toHaveAccessibleDescription(
      "£2,000 below what was expected · £1,500 paid in · £3,000 moved · Accounts, Income & expenses",
    );
  });

  it.each([
    [
      2052,
      "A year sooner",
      "August's close brought retirement a year sooner, to 60",
    ],
    [
      2056,
      "3 years later",
      "August's close brought retirement 3 years later, to 64",
    ],
    [null, "Now never", "August's close put retirement out of reach"],
  ] as const)(
    "says how far the close moved the retirement, to %s",
    async (retired, step, title) => {
      vi.mocked(movedSince).mockReturnValue({
        ...moved,
        now: { liquid: 590_500, retired },
        steps: [
          { groups: ["balances"], standing: { liquid: 590_500, retired } },
        ],
      });
      await renderClose();

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        title,
      );
      expect(rows()[1]?.[1]).toBe(step);
    },
  );

  it("says where a retirement out of reach came within it, and where it stays out", async () => {
    vi.mocked(movedSince).mockReturnValue({
      ...moved,
      expected: { liquid: 600_000, retired: null },
      now: { liquid: 590_500, retired: 2055 },
      steps: [
        { groups: ["changes"], standing: { liquid: 590_500, retired: 2055 } },
      ],
    });
    await renderClose();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "August's close brought retirement within reach, at 63",
    );
    expect(rows()[0]).toStrictEqual([
      "As the month end expected",
      "Never",
      "£600,000",
    ]);
    expect(rows()[1]?.[1]).toBe("Now at 63");
  });

  it("says a retirement still out of reach", async () => {
    vi.mocked(movedSince).mockReturnValue({
      ...moved,
      expected: { liquid: 600_000, retired: null },
      now: { liquid: 590_500, retired: null },
    });
    await renderClose();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "August closed £2,140 ahead of plan; retirement still out of reach",
    );
  });

  it("says there is nothing to compare with before a close before the latest is kept", async () => {
    await renderClose({ since: null });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "August is closed",
    );
    expect(
      screen.getByText("September closes from 25 September"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "What moved" })).getByText(
        "What moved shows from the next close, once there is a close before it to compare with.",
      ),
    ).toBeInTheDocument();
    expect(movedSince).not.toHaveBeenCalled();
    expect(updating()).toBe("/close?update");
    expect(getClosesBack).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("region", {
        name: "Where the invested balances landed",
      }),
    ).not.toBeInTheDocument();
  });

  // An earlier month closed again since August's close took the
  // balances back to July's, the month of the close compared with.
  it("says there is nothing to compare with where the balances have been closed back onto the close before", async () => {
    await renderClose({
      since: {
        balances: null,
        before: saved(july),
        now: { ...kept, asOf: { month: 6, year: 2026 } },
      },
    });

    expect(
      screen.getByText(
        "The balances are as of July 2026, no later than the close before August's, so no month between them is left to compare.",
      ),
    ).toBeInTheDocument();
    expect(movedSince).not.toHaveBeenCalled();
  });

  // August is closed, and its balances are opened again, on August,
  // with the way back to what moved; nothing is compared meanwhile.
  it("opens the worksheet again on the month closed while the balances are updated", async () => {
    await renderClose({ address: { update: "" } });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "August is closed",
    );
    expect(
      screen.getByText("September closes from 25 September"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Balances on 25 Aug 2026" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("banner")).getByRole("link", {
        name: "What moved",
      }),
    ).toHaveAttribute("href", "/close");
    expect(getSinceClose).not.toHaveBeenCalled();
    expect(getClosesBack).not.toHaveBeenCalled();
  });

  // August's balances, updated and saved, go back to what moved rather
  // than leave the worksheet open on a month already closed.
  it("goes back to what moved once the balances updated are saved", async () => {
    vi.mocked(closeBalances).mockResolvedValue(
      saved({ asOf: { month: 7, year: 2026 }, isRecorded: false }),
    );
    await renderClose({ address: { update: "" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(replace).toHaveBeenCalledExactlyOnceWith("/close");
    });
  });

  // July's close kept past the rules, with no balances to read either;
  // then read, but refused moved on.
  it("says why the close before the latest cannot be read, or moved on, now", async () => {
    await renderClose({
      since: {
        balances: null,
        before: refused("A rule since tightened"),
        now: kept,
      },
    });

    expect(
      screen.getByText(
        "The close before August's was kept in a form this app cannot read, so what moved shows from the next close.",
      ),
    ).toBeInTheDocument();

    vi.mocked(movedSince).mockImplementation(() => {
      throw new Refusal("A rule the month end breaks");
    });
    await renderClose();

    expect(
      screen.getByText(
        "The close before August's cannot be read now: A rule the month end breaks.",
      ),
    ).toBeInTheDocument();
  });

  // July's close kept past the rules, its balances read alone and laid
  // over the household now: what moved, invented, is the balances' step
  // alone, the rates and the changes since inside what the month end
  // expected.
  it("lays the balances of a close it cannot read whole over today's plan, saying why the rates and changes are not told apart", async () => {
    const balances = { accounts: july.accounts, asOf: july.asOf };
    vi.mocked(movedOver).mockReturnValue({
      ...moved,
      changes: [],
      now: { liquid: 605_000, retired: 2053 },
      rates: [],
      steps: moved.steps.slice(0, 1),
    });
    await renderClose({
      since: { balances, before: refused("A rule since tightened"), now: kept },
    });

    expect(movedOver).toHaveBeenCalledExactlyOnceWith(balances, kept);
    expect(movedSince).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "August closed £2,140 ahead of plan; retirement still at 61",
    );
    expect(rows()).toStrictEqual([
      ["As the month end expected", "61", "£600,000"],
      ["Balances against the plan", "Unchanged", "+£5,000"],
      ["Now", "61", "£605,000"],
    ]);
    expect(detail("As the month end expected")).toHaveAccessibleDescription(
      "July 2026's balances carried 1 month on as today's plan expects",
    );
    expect(
      within(screen.getByRole("region", { name: "What moved" }))
        .getAllByRole("paragraph")
        .map((note) => note.textContent),
    ).toStrictEqual([
      "The close before August's was kept in a form this app cannot read, so its balances are carried on by today's plan, rates and your changes since included: without that close's plan, what they moved cannot be told apart.",
      "Each row is worked out after the ones above it. Liquid net worth leaves out the property, the vehicles and a pension its owner cannot yet draw, in today's money.",
    ]);
  });

  // On Friday 25 September September is cut, and the latest point is
  // August's.
  it("opens the worksheet on the month that is due from its cut until it is closed", async () => {
    await renderClose({ day: "2026-09-25" });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "September isn't closed yet",
    );
    expect(screen.getByText("Due since 25 September")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Balances on 25 Sep 2026" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("banner")).queryByRole("link"),
    ).not.toBeInTheDocument();
    expect(getSinceClose).not.toHaveBeenCalled();
    expect(getClosesBack).not.toHaveBeenCalled();
  });

  // In the middle of November, with September and October both cut
  // after August's point and November not until the 25th: October is the
  // month the worksheet opens on, and a month has been due since
  // September was cut.
  it("says a month has been due since the month after the latest point's was cut", async () => {
    await renderClose({ day: "2026-11-15" });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "October isn't closed yet",
    );
    expect(screen.getByText("Due since 25 September")).toBeInTheDocument();
  });

  it("opens the worksheet on a household with no point yet, saying no month is closed yet", async () => {
    await renderClose({ household: { ...kept, points: [] } });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "August isn't closed yet",
    );
    expect(screen.getByText("No month closed yet")).toBeInTheDocument();
  });

  it("says to leave a scenario open, and draws nothing of it", async () => {
    await renderClose({ scenario: "Retire early" });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Month end",
    );
    expect(
      screen.getByText("A month is closed in the household"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(getSinceClose).not.toHaveBeenCalled();
    expect(getClosesBack).not.toHaveBeenCalled();
  });
});

describe("Where the invested balances landed", () => {
  // The reading given of the closes, over the household now given, or
  // the reference with no holdings imported.
  async function renderLanded(
    reading: Landing,
    now: Kept = { ...kept, targets: null },
  ): Promise<void> {
    vi.mocked(landedSince).mockReturnValue(reading);
    await renderClose({
      closes: julyClosed,
      since: { balances: null, before: saved(july), now },
    });
  }

  beforeEach(() => {
    vi.mocked(movedSince).mockReturnValue(moved);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // The bands to three significant figures, the actual to the pound.
  it("says where the invested balances landed over the month since the close before, between what moved and trades", async () => {
    await renderLanded({ landed, passed: [] }, kept);

    const card = screen.getByRole("region", {
      name: "Where the invested balances landed",
    });
    expect(within(card).getByText("Sect. VII.iii")).toHaveClass("label");
    expect(
      within(screen.getByRole("region", { name: "Trades" })).getByText(
        "Sect. VII.iv",
      ),
    ).toHaveClass("label");
    expect(landing()).toStrictEqual({
      caption: "Since the close of July 2026",
      lines: [
        "Over the month since July 2026's close, the invested balances landed in the middle half of the futures its plan drew.",
        "£190,412 invested on 25 Aug 2026. The middle future of the 1,000 came to £191,000; the middle half ran from £186,000 to £197,000, and the middle 80% from £180,000 to £202,000.",
        "Invested balances are the accounts growing at the plan rate that were checked at both closes, as their statements give them. 1 of them was not checked at both and is left out.",
        "The futures count paid in as Portfolio Performance gives it for Stocks & shares ISA, £300 more than the plan paid, and as the plan paid for the rest.",
      ],
    });
    expect(landedSince).toHaveBeenCalledExactlyOnceWith(julyCloses, kept);
  });

  // March's close read five months on, February's passed over, and both
  // invested balances named by Portfolio Performance, less than planned.
  it("says where they landed over the months since an older close, naming each close passed over", async () => {
    await renderLanded(
      {
        landed: {
          ...landed,
          actual: 183_250,
          asOf: { month: 2, year: 2026 },
          beyond: -300,
          left: 2,
          months: 5,
          paidBy: ["Stocks & shares ISA", "Workplace pension"],
        },
        passed: [{ kind: "unreadable", month: { month: 1, year: 2026 } }],
      },
      kept,
    );

    expect(landing()).toStrictEqual({
      caption: "Since the close of March 2026",
      lines: [
        "Over the 5 months since March 2026's close, the invested balances landed in the bottom quarter of the futures its plan drew.",
        "£183,250 invested on 25 Aug 2026. The middle future of the 1,000 came to £191,000; the middle half ran from £186,000 to £197,000, and the middle 80% from £180,000 to £202,000.",
        "Invested balances are the accounts growing at the plan rate that were checked at both closes, as their statements give them. 2 of them were not checked at both and are left out.",
        "The futures count paid in as Portfolio Performance gives it for Stocks & shares ISA and Workplace pension, £300 less than the plan paid.",
        "February 2026's close is passed over, since it is in a form this app cannot read.",
      ],
    });
  });

  // August 2025's close read a year on, from a household whose holdings
  // were imported on the 20th, before August's cut, and whose plan draws
  // on its savings.
  it("says where they landed over the year, that paid in is as planned where the holdings are older than the close, and that the plan draws on the savings", async () => {
    await renderLanded(
      {
        landed: {
          ...landed,
          actual: 250_000,
          asOf: { month: 7, year: 2025 },
          beyond: 0,
          isDrawing: true,
          left: 0,
          months: 12,
          paidBy: [],
        },
        passed: [],
      },
      { ...kept, targets: { ...targets, importedOn: "2026-08-20" } },
    );

    expect(landing().lines).toStrictEqual([
      "Over the year since August 2025's close, the invested balances landed in the top tenth of the futures its plan drew.",
      "£250,000 invested on 25 Aug 2026. The middle future of the 1,000 came to £191,000; the middle half ran from £186,000 to £197,000, and the middle 80% from £180,000 to £202,000.",
      "Invested balances are the accounts growing at the plan rate that were checked at both closes, as their statements give them.",
      "The futures count paid in as the plan paid it, since the holdings were imported before this close.",
      "The plan draws on the savings in at least one of these months, but the futures here draw nothing, so the invested balances can land lower among them than the markets alone would put them.",
    ]);
  });

  // Portfolio Performance says 40p more went into the ISA than the plan
  // paid it, which is nothing to the pound.
  it("says paid in was the same as the plan paid where it is to the pound", async () => {
    await renderLanded(
      { landed: { ...landed, beyond: 0.4 }, passed: [] },
      kept,
    );

    expect(landing().lines[3]).toBe(
      "The futures count paid in as Portfolio Performance gives it for Stocks & shares ISA, the same as the plan paid, and as the plan paid for the rest.",
    );
  });

  // Below the bottom tenth, and between the top quarter and the top
  // tenth, with no holdings imported.
  it.each([
    [170_000, "bottom tenth"],
    [200_000, "top quarter"],
  ] as const)(
    "names the band £%i landed in, the %s, and counts paid in as planned with no holdings",
    async (actual, band) => {
      await renderLanded({
        landed: { ...landed, actual, paidBy: [] },
        passed: [],
      });

      const [verdict, , , paid] = landing().lines;
      expect(verdict).toBe(
        `Over the month since July 2026's close, the invested balances landed in the ${band} of the futures its plan drew.`,
      );
      expect(paid).toBe("The futures count paid in as the plan paid it.");
    },
  );

  it("says no month in the year before was closed, so it shows from the next close", async () => {
    await renderLanded({ landed: null, passed: [] });

    expect(landing()).toStrictEqual({
      caption: null,
      lines: [
        "No month in the year before August 2026 was closed here, so this shows from the next close.",
      ],
    });
  });

  it("says no invested balance was checked at both this close and one before it", async () => {
    await renderLanded({
      landed: null,
      passed: [{ kind: "unchecked", month: { month: 6, year: 2026 } }],
    });

    expect(landing().lines).toStrictEqual([
      "No invested balance was checked at both this close and one in the year before it.",
    ]);
  });

  it("says no close in the year before can be read, and why each was passed over", async () => {
    await renderLanded({
      landed: null,
      passed: [
        { kind: "unreadable", month: { month: 4, year: 2026 } },
        { kind: "short", month: { month: 5, year: 2026 } },
        { kind: "unchecked", month: { month: 6, year: 2026 } },
      ],
    });

    expect(landing().lines).toStrictEqual([
      "No close in the year before August 2026 can be read, so this shows from the next close.",
      "May 2026's close is passed over, since it is in a form this app cannot read.",
      "June 2026's close is passed over, since its plan has no spread to draw futures from.",
      "July 2026's close is passed over, since no invested balance was checked at both it and this one.",
    ]);
  });
});
