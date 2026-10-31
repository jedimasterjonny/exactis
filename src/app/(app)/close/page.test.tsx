import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Kept } from "@/data/household";
import type { Moved } from "@/lib/moved";

import { soundKept } from "@/data/household";
import { kept } from "@/data/household.fixture";
import { Refusal, refused, saved } from "@/lib/answer";
import { movedSince } from "@/lib/moved";
import { getHousehold, getOpened, getSinceClose } from "@/store/household";

import Close from "./page";

vi.mock("@/store/household", () => ({
  getHousehold: vi.fn(),
  getOpened: vi.fn(),
  getSinceClose: vi.fn(),
}));
vi.mock("@/actions/accounts", () => ({ closeBalances: vi.fn() }));
vi.mock("@/lib/moved", () => ({ movedSince: vi.fn() }));

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
    expected: 900_000,
    moved: 3000,
    now: 902_140,
    paid: 1500,
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

// The line beneath a row of what moved, which describes its name.
function detail(name: string): HTMLElement {
  return screen.getByRole("rowheader", { name });
}

// The links of the trades' card, each its name and where it goes.
function links(): (null | string)[][] {
  return within(screen.getByRole("region", { name: "Trades" }))
    .getAllByRole("link")
    .map((link) => [link.textContent, link.getAttribute("href")]);
}

// The month end at the address given on the day given, over the
// household given, as the store reads it, with a scenario open where one
// is named, and the close before the latest as given.
async function renderClose({
  address = {},
  day = "2026-09-15",
  household = kept,
  scenario = null,
  since = { before: saved(july), now: kept },
}: {
  readonly address?: Record<string, string>;
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
  render(await Close({ searchParams: Promise.resolve(address) }));
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // August's point is the latest, and on the fifteenth of September
  // August is the last month that has ended.
  it("says what moved the plan since the close before, under a title that gives the answer", async () => {
    await renderClose();

    expect(screen.getByText("Sect. VII · Month end")).toHaveClass("label");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "August closed £2,140 ahead of plan; retirement still at 61",
    );
    expect(
      screen.getByText(
        "Mostly rates and their sources · September closes from 1 October",
      ),
    ).toBeInTheDocument();
    expect(movedSince).toHaveBeenCalledExactlyOnceWith(july, kept);
    expect(updating()).toBe("/close?update");

    const balances = screen.getByRole("region", {
      name: "Balances at the end of August 2026",
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
      "As the balances stoodEnd of July 2026£897,640",
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

  // September closed, on the fifteenth of October, over holdings
  // imported on the seventh of September, before September ended.
  it("asks for this month's holdings where they were imported before the month closed ended", async () => {
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
    expect(links()).toStrictEqual([
      ["Assumptions › Target allocation", "/assumptions"],
      ["Choose an amount", "/cogitator"],
    ]);
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
      screen.getByText("September closes from 1 October"),
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
      screen.getByText("September closes from 1 October"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "What moved" })).getByText(
        "What moved shows from the next close, once there is a close before it to compare with.",
      ),
    ).toBeInTheDocument();
    expect(movedSince).not.toHaveBeenCalled();
    expect(updating()).toBe("/close?update");
  });

  // An earlier month closed again since August's close took the
  // balances back to July's, the month of the close compared with.
  it("says there is nothing to compare with where the balances have been closed back onto the close before", async () => {
    await renderClose({
      since: {
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
      screen.getByText("September closes from 1 October"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", {
        name: "Balances at the end of August 2026",
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("banner")).getByRole("link", {
        name: "What moved",
      }),
    ).toHaveAttribute("href", "/close");
    expect(getSinceClose).not.toHaveBeenCalled();
  });

  it("says why the close before the latest cannot be read, or moved on, now", async () => {
    await renderClose({
      since: { before: refused("A rule since tightened"), now: kept },
    });

    expect(
      screen.getByText(
        "The close before August's cannot be read now: A rule since tightened.",
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

  // On the fourth of October September is the last month that has
  // ended, and the latest point is August's.
  it("opens the worksheet on the month that is due until it is closed", async () => {
    await renderClose({ day: "2026-10-04" });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "September isn't closed yet",
    );
    expect(screen.getByText("Due since 1 October")).toBeInTheDocument();
    expect(
      screen.getByRole("region", {
        name: "Balances at the end of September 2026",
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("banner")).queryByRole("link"),
    ).not.toBeInTheDocument();
    expect(getSinceClose).not.toHaveBeenCalled();
  });

  // In the middle of November, with September and October both still to
  // close after August's point: October is the month the worksheet opens
  // on, and a month has been due since September could first be closed.
  it("says a month has been due since the month after the latest point's could first be closed", async () => {
    await renderClose({ day: "2026-11-15" });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "October isn't closed yet",
    );
    expect(screen.getByText("Due since 1 October")).toBeInTheDocument();
  });

  it("opens the worksheet on a household with no point yet, saying only that it is due", async () => {
    await renderClose({ household: { ...kept, points: [] } });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "August isn't closed yet",
    );
    expect(screen.getByText("Due")).toBeInTheDocument();
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
  });
});
