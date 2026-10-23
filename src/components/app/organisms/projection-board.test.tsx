import type { JSX } from "react";

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";
import type { Shortfall } from "@/data/cma";
import type { Milestone } from "@/data/milestones";
import type { Plan, Spread } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";
import type { ProjectionPoint } from "@/engine/projection";
import type { Slice } from "@/hooks/futures.worker";

import { saveAges } from "@/actions/plan";
import { toast } from "@/components/kit/toast";
import { accounts as fixture } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { kept } from "@/data/household.fixture";
import { retiring } from "@/data/income.fixture";
import { atAge, retiringAt } from "@/data/milestones";
import { working } from "@/data/owners.fixture";
import { futureOf } from "@/engine/futures";
import { liquidOf, project, worthsIn } from "@/engine/projection";
import { forget } from "@/hooks/use-futures";
import { refused } from "@/lib/answer";
import { formatGbp } from "@/lib/money";
import { bySlot, commit, slider } from "@/test/dom";
import { FuturesWorker } from "@/test/futures-worker";

import { ProjectionBoard, settle } from "./projection-board";

vi.mock("@/actions/plan", () => ({ saveAges: vi.fn() }));
vi.mock("@/components/kit/toast", () => ({ toast: { add: vi.fn() } }));
// The engine as it is, watched, so a test can tell when the board runs
// it.
vi.mock(import("@/engine/projection"), async (importOriginal) => {
  const engine = await importOriginal();
  return { ...engine, project: vi.fn(engine.project) };
});

const { milestones, schedule } = kept;
const [, , , home, mortgage] = fixture;

// The fixture's accounts, the pension marked droppable, so a month short
// of its fixed sum pays it what the month has rather than drawing on the
// ISA and the cash for it, as the years below are worked.
const accounts: readonly Account[] = [
  { ...fixture[0], isDroppable: true },
  ...fixture.slice(1),
];

// No CMA, so no spread to draw the futures at, which is how most of
// the board is read: the futures are the chance of success's to test.
const short: Shortfall = { short: "No CMA is pulled" };

// A worker that draws the first slice it is handed and never answers
// another, so a run stands part way.
class Stalled extends FuturesWorker {
  #hasAnswered = false;

  public override postMessage(slice: Slice): void {
    if (!this.#hasAnswered) {
      this.#hasAnswered = true;
      super.postMessage(slice);
    }
  }
}

// The vertical rule recharts draws for a ReferenceLine, which carries the
// year it stands at as an attribute. A rule has no role, label or text,
// so no query is more accessible than this one and none can be
// suggested.
const marks = (): (null | string)[] =>
  screen
    .queryAllByText(
      (_content, element) =>
        element?.classList.contains("recharts-reference-line-line") === true,
      { suggest: false },
    )
    .map((mark) => mark.getAttribute("x"));

// The board over the fixture's schedule, or the one given, and no
// milestone but retirement, or those given, on the plan given or the
// fixture's retiring one: born in 1992 and retiring at 61, its owner
// retires in 2053, within the plan from 2026, when they are 34, to
// 2083, when they are 91; with no spread to draw the futures at,
// unless one is given, over the fixture's accounts, unless others are.
function board(
  held: Plan = retiring,
  lines: Schedule = schedule,
  {
    listed = [],
    owned = accounts,
    scenario = null,
    spread = short,
  }: {
    readonly listed?: readonly Milestone[];
    readonly owned?: readonly Account[];
    readonly scenario?: null | string;
    readonly spread?: Shortfall | Spread;
  } = {},
): JSX.Element {
  return (
    <ProjectionBoard
      accounts={owned}
      milestones={listed}
      plan={held}
      scenario={scenario}
      schedule={lines}
      spread={spread}
    />
  );
}

// The fixture's schedule with the retirement living starting in the
// year given.
function livingFrom(firstYear: number, isTied: boolean): Schedule {
  return {
    ...schedule,
    expenses: schedule.expenses.map((line) =>
      line.id === 14
        ? { ...line, firstYear, startsAt: isTied ? "retirement" : null }
        : line,
    ),
  };
}

// A year of a plan as the engine projects it, over the fixture's
// schedule or the one given.
function pointIn(
  held: Plan,
  year: number,
  lines: Schedule,
): ProjectionPoint | undefined {
  return project(accounts, lines, held).find(
    (candidate) => candidate.year === year,
  );
}

// The liquidity the chart gives for a year of a plan, as its tooltip
// writes it to begin with: what every account it draws counts for in
// the liquid net worth, which is every one but the home, the mortgage
// owed among them, and the pension left out before its owner's pension
// age.
function totalIn(held: Plan, year: number, lines: Schedule = schedule): string {
  const point = pointIn(held, year, lines);
  return formatGbp(
    point === undefined
      ? 0
      : Object.values(
          liquidOf(worthsIn(point, accounts), year, { accounts, plan: held }),
        ).reduce((sum, worth) => sum + worth, 0),
  );
}

// Types an age into the box and leaves it, which commits it.
function typeAge(age: string): void {
  const input = screen.getByRole("textbox", { name: "Retirement age" });
  commit(input, age);
}

// The net worth the plan holds entering a year, as the net worth tile
// reads it: what every account the fixture holds is worth, the home and
// the mortgage owed on it among them, and the pension at what drawing
// it would leave.
function worthIn(held: Plan, year: number, lines: Schedule = schedule): string {
  const point = pointIn(held, year, lines);
  return formatGbp(
    point === undefined
      ? 0
      : Object.values(worthsIn(point, accounts)).reduce(
          (sum, worth) => sum + worth,
          0,
        ),
  );
}

describe("ProjectionBoard", () => {
  // Each test opens a page of its own, with no run kept from the last.
  beforeEach(() => {
    forget();
  });

  // Retirement is chosen to begin with: the tile reads the net worth the
  // plan holds entering 2053, the home and the mortgage owed on it among
  // the accounts, and the age's hint the year before it. The plan runs
  // to 2083, and the net worth tile reads what it holds entering that
  // year.
  it("leads the tiles with the milestone tile at retirement, charts the engine's projection marked there, and gives the last working year under the age", () => {
    render(board());

    expect(screen.getByText("At Retirement")).toBeInTheDocument();
    expect(screen.getByText(worthIn(retiring, 2053))).toHaveClass("figure");
    expect(screen.getByText("Net worth · 2053 · age 61")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Retirement age" }),
    ).toHaveAccessibleDescription("Last working year 2052");
    expect(
      within(screen.getByRole("group", { name: "Milestones" })).getByRole(
        "button",
        { name: "Retirement 2053", pressed: true },
      ),
    ).toBeInTheDocument();
    // The chance of success follows the milestone tile, with nothing to
    // draw the futures at, and the net worth follows it.
    expect(
      screen.getAllByText(
        (_content, element) => element?.hasAttribute("data-tone") === true,
        { suggest: false },
      ),
    ).toHaveLength(3);
    expect(screen.getByText("Chance of success")).toHaveClass("label");
    expect(
      screen.getByText("No spread to draw the futures from"),
    ).toBeInTheDocument();
    expect(screen.getByText("Net worth at 91")).toHaveClass("label");
    expect(screen.getByText(worthIn(retiring, 2083))).toHaveClass("figure");
    expect(screen.getByText("At the plan's own rates")).toBeInTheDocument();
    expect(
      screen.getAllByRole("paragraph").map((line) => line.textContent),
    ).toStrictEqual(["Last working year 2052"]);
    expect(screen.getByRole("application")).toHaveClass("recharts-surface");
    expect(marks()).toStrictEqual(["2053"]);
    expect(screen.getByRole("textbox", { name: "Retirement age" })).toHaveValue(
      "61",
    );
    expect(slider("Retirement age")).toHaveAttribute("min", "34");
    expect(slider("Retirement age")).toHaveAttribute("max", "91");
  });

  // Retiring at 34 stops the salary from 2026, so 2028 opens on less
  // than it does retiring at 61, and the chart's figure for it is the
  // engine's for the age moved to rather than the age handed down. With
  // no salary the mortgage is paid out of the savings, so the plan draws
  // a pension early in 2031 and runs out in 2034, and the chart marks
  // both beside the retirement in 2026.
  // On fake timers, so the save cannot fire however long the chart takes
  // to draw: on real ones a column for every account in every year took
  // the test past it under a loaded suite. The crosshair moves a frame
  // after its key, so the frame is stepped to by hand.
  it("projects every figure at the age moved to, before it is saved", () => {
    vi.useFakeTimers();
    render(board());

    typeAge("34");

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    act(() => {
      vi.advanceTimersToNextFrame();
    });

    const moved = totalIn(retiringAt(retiring, 34), 2028);

    expect(screen.getByText("2028 · Age 36")).toBeInTheDocument();
    expect(moved).not.toBe(totalIn(retiring, 2028));
    expect(screen.getByText(moved)).toHaveClass("figure");
    expect(marks()).toStrictEqual(["2026", "2031", "2034"]);
    expect(saveAges).not.toHaveBeenCalled();
  });

  // The retirement living is tied to start at retirement, so retiring
  // at 52 rather than 61 starts it in 2044 rather than 2053, and 2047
  // pays it beside the household spending that runs to 2051: the chart
  // gives the engine's figure for the line moved with the age, not the
  // one handed down. At 55 the pension is out of the liquidity until 57
  // and the ISA alone is counted, so its figure and the total read the
  // same, the total written last. On fake timers, as the test before it
  // is, so the save cannot fire and drop the draft before the figure is
  // read.
  it("moves a line tied to retirement with the age moved to, before it is saved", () => {
    vi.useFakeTimers();
    render(board(retiring, livingFrom(2053, true)));

    typeAge("52");

    const chart = screen.getByRole("application");
    chart.focus();
    for (let step = 0; step < 21; step += 1) {
      fireEvent.keyDown(chart, { key: "ArrowRight" });
    }
    act(() => {
      vi.advanceTimersToNextFrame();
    });

    const early = retiringAt(retiring, 52);
    const moved = totalIn(early, 2047, livingFrom(2044, false));

    expect(screen.getByText("2047 · Age 55")).toBeInTheDocument();
    expect(moved).not.toBe(totalIn(early, 2047, livingFrom(2053, false)));
    expect(screen.getAllByText(moved).at(-1)).toHaveClass("figure");
    expect(saveAges).not.toHaveBeenCalled();
  });

  // The children leave home in 2040 and the downsize is in 2059, either
  // side of retirement in 2053, and each is marked beside it; the
  // retirement mark moves with the age as the others stay.
  it("marks every milestone the household lists beside retirement", () => {
    render(board(retiring, schedule, { listed: milestones }));

    expect(marks()).toStrictEqual(["2040", "2053", "2059"]);

    fireEvent.keyDown(slider("Retirement age"), { key: "ArrowRight" });

    expect(marks()).toStrictEqual(["2040", "2054", "2059"]);
  });

  it("follows a dragged age at once and saves it once it has settled", () => {
    vi.useFakeTimers();
    render(board());

    fireEvent.keyDown(slider("Retirement age"), { key: "ArrowRight" });

    expect(screen.getByText("Net worth · 2054 · age 62")).toBeInTheDocument();
    expect(marks()).toStrictEqual(["2054"]);
    expect(saveAges).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(settle);
    });

    expect(saveAges).toHaveBeenCalledExactlyOnceWith({ retires: 62 }, null);
  });

  // Drawn in a scenario, so the age names it, and a save that lands
  // after the scenario is left is refused rather than kept elsewhere.
  it("saves the age to the branch the board was drawn on, by name", () => {
    vi.useFakeTimers();
    render(board(retiring, schedule, { scenario: "Retire early" }));

    fireEvent.keyDown(slider("Retirement age"), { key: "ArrowRight" });
    act(() => {
      vi.advanceTimersByTime(settle);
    });

    expect(saveAges).toHaveBeenCalledExactlyOnceWith(
      { retires: 62 },
      "Retire early",
    );
  });

  // The menu opens another scenario while an age stepped in the first
  // waits to be saved: the age names the scenario it was stepped in.
  it("saves a waiting age to the branch it was stepped in, not one opened since", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      board(retiring, schedule, { scenario: "Retire early" }),
    );

    fireEvent.keyDown(slider("Retirement age"), { key: "ArrowRight" });
    rerender(board(retiring, schedule, { scenario: "Move house" }));
    act(() => {
      vi.advanceTimersByTime(settle);
    });

    expect(saveAges).toHaveBeenCalledExactlyOnceWith(
      { retires: 62 },
      "Retire early",
    );
  });

  it("saves a run of arrow steps once, at the age they stop on", () => {
    vi.useFakeTimers();
    render(board());

    fireEvent.keyDown(slider("Retirement age"), { key: "ArrowRight" });
    fireEvent.keyDown(slider("Retirement age"), { key: "ArrowRight" });
    fireEvent.keyDown(slider("Retirement age"), { key: "ArrowRight" });
    act(() => {
      vi.advanceTimersByTime(settle);
    });

    expect(screen.getByText("Net worth · 2056 · age 64")).toBeInTheDocument();
    expect(saveAges).toHaveBeenCalledExactlyOnceWith({ retires: 64 }, null);
  });

  // Retiring at 55 stops the salary six years sooner, so the plan
  // enters 2083 holding less, and the net worth tile reads the plan at
  // the age moved to, as the milestone tile does.
  it("moves the tile and the mark to a typed age, and saves it", () => {
    vi.useFakeTimers();
    render(board());

    typeAge("55");
    act(() => {
      vi.advanceTimersByTime(settle);
    });

    const moved = worthIn(retiringAt(retiring, 55), 2083);

    expect(screen.getByText("Net worth · 2047 · age 55")).toBeInTheDocument();
    expect(marks()).toStrictEqual(["2047"]);
    expect(moved).not.toBe(worthIn(retiring, 2083));
    expect(screen.getByText(moved)).toHaveClass("figure");
    expect(saveAges).toHaveBeenCalledExactlyOnceWith({ retires: 55 }, null);
  });

  // Moved to 62 over the store's 61, the board is handed 64, saved from
  // somewhere else: its draft was drawn over an age that has gone, and
  // the store's is shown.
  it("shows the store's age once it moves past a draft", () => {
    const { rerender } = render(board());

    fireEvent.keyDown(slider("Retirement age"), { key: "ArrowRight" });

    expect(screen.getByText("Net worth · 2054 · age 62")).toBeInTheDocument();

    rerender(board(retiringAt(retiring, 64)));

    expect(screen.getByText("Net worth · 2056 · age 64")).toBeInTheDocument();
    expect(marks()).toStrictEqual(["2056"]);
  });

  it("puts the store's age back and says why when the store refuses it", async () => {
    vi.useFakeTimers();
    vi.mocked(saveAges).mockResolvedValue(
      refused("A plan's owner retires no later than it ends"),
    );
    render(board());

    fireEvent.keyDown(slider("Retirement age"), { key: "ArrowRight" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(settle);
    });

    expect(screen.getByText("Net worth · 2053 · age 61")).toBeInTheDocument();
    expect(marks()).toStrictEqual(["2053"]);
    expect(toast.add).toHaveBeenCalledExactlyOnceWith({
      description: "A plan's owner retires no later than it ends",
      title: "Retirement age not saved",
      type: "error",
    });
  });

  it("sends a save still waiting when the board is taken down", () => {
    vi.useFakeTimers();
    const { unmount } = render(board());

    fireEvent.keyDown(slider("Retirement age"), { key: "ArrowLeft" });
    unmount();

    expect(saveAges).toHaveBeenCalledExactlyOnceWith({ retires: 60 }, null);

    vi.advanceTimersByTime(settle);

    expect(saveAges).toHaveBeenCalledOnce();
  });

  // The chart's place says there is nothing to project, so the age and
  // the chips above it go with the plot, and the tile keeps the last
  // working year.
  it("keeps the retirement tile, with no milestone to choose, over a projection of nothing", () => {
    render(
      <ProjectionBoard
        accounts={[]}
        milestones={milestones}
        plan={retiring}
        scenario={null}
        schedule={schedule}
        spread={short}
      />,
    );

    expect(screen.getByText("Nothing to project yet")).toBeInTheDocument();
    expect(screen.getByText("Retirement")).toBeInTheDocument();
    expect(screen.getByText("Last working year 2052")).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Milestones" }),
    ).not.toBeInTheDocument();
  });

  // The home and its mortgage alone hold something to project and
  // nothing for the futures to grow: the chart draws, and the chance
  // says why it does not, for itself and for each milestone reached
  // when conditions hold.
  it("says there are no savings for the futures to grow over a plan of a home and its mortgage alone", () => {
    render(
      board(retiring, schedule, {
        listed: milestones,
        owned: [home, mortgage],
        spread: { inflation: 0, rate: 0 },
      }),
    );

    expect(screen.getByRole("application")).toHaveClass("recharts-surface");
    expect(
      screen.getAllByText("No savings for the futures to grow"),
    ).toHaveLength(3);
    // The three milestones, and the mark where the plan runs out, at
    // retirement, since nothing is saved for the years after it.
    expect(marks()).toStrictEqual(["2040", "2053", "2059", "2053"]);
    expect(
      screen.queryByText(bySlot("milestone-chip-unplaced"), { suggest: false }),
    ).not.toBeInTheDocument();
  });

  // Born in 1992, a plan of three years from 2026 holds £30,000 in an
  // ISA and the fixture's home, spending £500 a month, which lasts, so
  // every future is the plan at its rates where nothing strays, and
  // each reaches thirty grand of net worth and thirty grand of liquid
  // net worth at once, in 2026; retiring at 92 falls past the plan's
  // years, so the milestone at 35, in 2027, is chosen to begin with.
  // The futures are drawn by the worker stood in for jsdom's missing
  // one, and until they are the milestones the run will place are said
  // to be coming; none reaches a million, whose chip gives the share
  // that do once they are. Each tile reads the measure its milestone is
  // on, so the home counts in the one and not in the other.
  it("draws the futures once, says a milestone reached when conditions hold is coming, and marks it at the median once the run is drawn", async () => {
    vi.stubGlobal("Worker", FuturesWorker);
    const planned = { ...retiringAt(retiring, 92), years: 3 };
    const isa: Account = {
      balance: 30000,
      growth: { kind: "plan" },
      id: 1,
      kind: "tax-free",
      name: "ISA",
      owner: 1,
    };
    const spending: Schedule = {
      expenses: [{ ...expenseLines[0], amount: 500, growth: "nominal" }],
      income: [],
    };
    const listed: readonly Milestone[] = [
      { conditions: atAge(35), id: 1, name: "Ada 18" },
      {
        conditions: [{ measure: "worth", of: "pounds", times: 30000 }],
        id: 2,
        name: "Thirty grand",
      },
      {
        conditions: [{ measure: "liquid", of: "pounds", times: 30000 }],
        id: 3,
        name: "Thirty liquid",
      },
      {
        conditions: [{ measure: "worth", of: "pounds", times: 1e6 }],
        id: 4,
        name: "A million",
      },
    ];
    render(
      board(planned, spending, {
        listed,
        owned: [isa, home],
        spread: { inflation: 0, rate: 0 },
      }),
    );

    // The chance tile's caption, held: what the run comes to is read off
    // it again rather than looked for over the screen, since a look over
    // the chart's every column costs about as much as a slice of the run,
    // which the worker double draws on the test's own thread, and the
    // run was looked for at every slice.
    const chance = screen.getByText("Drawing 0 of 1,000 futures…");

    expect(screen.getByText("At Ada 18")).toBeInTheDocument();
    expect(chance).toBeInTheDocument();
    expect(screen.getAllByText("Drawing the futures…")).toHaveLength(3);
    expect(
      screen
        .getAllByText(bySlot("milestone-chip-unplaced"), { suggest: false })
        .map((chip) => chip.textContent),
    ).toStrictEqual(["Thirty grand …", "Thirty liquid …", "A million …"]);
    expect(marks()).toStrictEqual(["2027"]);

    await waitFor(
      () => {
        expect(chance).toHaveTextContent(/^Of 1,000 futures, lasting to 37$/);
      },
      { timeout: 5000 },
    );
    expect(screen.getByText("100%")).toHaveClass("figure");
    expect(screen.getAllByText("Median of 1,000 futures · 2026")).toHaveLength(
      2,
    );
    expect(
      screen
        .getAllByText(bySlot("milestone-chip-unplaced"), { suggest: false })
        .map((chip) => chip.textContent),
    ).toStrictEqual(["A million reached in 0%"]);
    // Recharts keeps a rule where it was mounted, so the ones the run
    // adds come after the plan's own, whatever their years.
    expect(new Set(marks())).toStrictEqual(new Set(["2026", "2027"]));

    fireEvent.click(screen.getByRole("button", { name: "Thirty grand 2026" }));

    expect(screen.getByText("At Thirty grand")).toBeInTheDocument();
    expect(screen.getByText(formatGbp(30000 + home.balance))).toHaveClass(
      "figure",
    );
    expect(screen.getByText("Net worth · 2026 · age 34")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Thirty liquid 2026" }));

    expect(screen.getByText("At Thirty liquid")).toBeInTheDocument();
    expect(screen.getByText("£30,000")).toHaveClass("figure");
    expect(
      screen.getByText("Liquid net worth · 2026 · age 34"),
    ).toBeInTheDocument();
  });

  // The plan above, its run standing at the first two slices: every
  // future drawn so far reaches thirty grand in 2026, so it is marked
  // there while the rest are drawn, and none reaches a million, which
  // is said to be coming still.
  it("marks a milestone reached when conditions hold at the median of the futures drawn so far", async () => {
    vi.stubGlobal("Worker", Stalled);
    const isa: Account = {
      balance: 30000,
      growth: { kind: "plan" },
      id: 1,
      kind: "tax-free",
      name: "ISA",
      owner: 1,
    };
    render(
      board(
        { ...retiringAt(retiring, 92), years: 3 },
        {
          expenses: [{ ...expenseLines[0], amount: 500, growth: "nominal" }],
          income: [],
        },
        {
          listed: [
            {
              conditions: [{ measure: "worth", of: "pounds", times: 30000 }],
              id: 1,
              name: "Thirty grand",
            },
            {
              conditions: [{ measure: "worth", of: "pounds", times: 1e6 }],
              id: 2,
              name: "A million",
            },
          ],
          owned: [isa, home],
          spread: { inflation: 0, rate: 0 },
        },
      ),
    );

    expect(
      await screen.findByRole("button", { name: "Thirty grand 2026" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Drawing 20 of 1,000 futures…"),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByText(bySlot("milestone-chip-unplaced"), { suggest: false })
        .map((chip) => chip.textContent),
    ).toStrictEqual(["A million …"]);
    expect(marks()).toStrictEqual(["2026"]);
  });

  // The children leave home in 2040, when the owner is 48: the tile
  // reads the plan then, and the chart draws that line solid. Moving
  // the age chooses retirement again, at the age moved to.
  it("reads the plan at the milestone a chip chooses, and at retirement again once the age moves", () => {
    render(board(retiring, schedule, { listed: milestones }));

    fireEvent.click(
      screen.getByRole("button", { name: "Kids leave home 2040" }),
    );

    expect(screen.getByText("At Kids leave home")).toBeInTheDocument();
    expect(screen.getByText(worthIn(retiring, 2040))).toHaveClass("figure");
    expect(screen.getByText("Net worth · 2040 · age 48")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Kids leave home 2040" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Retirement 2053" }),
    ).toHaveAttribute("aria-pressed", "false");

    fireEvent.keyDown(slider("Retirement age"), { key: "ArrowRight" });

    expect(screen.getByText("At Retirement")).toBeInTheDocument();
    expect(screen.getByText("Net worth · 2054 · age 62")).toBeInTheDocument();
  });

  // Choosing a milestone reads a year off the run the board holds rather
  // than running the engine again, since a run the chart has not seen is
  // redrawn column by column, and that held the chip's press back.
  it("reads the milestone a chip chooses without running the engine again", () => {
    render(board(retiring, schedule, { listed: milestones }));
    vi.mocked(project).mockClear();

    fireEvent.click(
      screen.getByRole("button", { name: "Kids leave home 2040" }),
    );

    expect(screen.getByText("At Kids leave home")).toBeInTheDocument();
    expect(project).not.toHaveBeenCalled();
  });

  // Retiring on twenty-five years of expenses in liquid net worth, the
  // plan at its own rates reaches it entering 2049, at 57, the pension
  // age, since the pension is no part of the liquid net worth before it:
  // retirement is chosen there and read on liquid net worth, and with no
  // age to drag, the row says what it is reached on. Ten thousand years
  // of expenses it never reaches, so there is no milestone to choose and
  // the tile says so.
  it("marks a retirement on conditions where the plan at its own rates reaches them, and says what it is reached on in the age's place", () => {
    const onConditions = (times: number): Plan => ({
      ...retiring,
      owners: [
        {
          ...working,
          retirement: [{ measure: "liquid", of: "expenses", times }],
        },
      ],
      retires: 92,
    });
    const reached = onConditions(25);
    const { measured } = futureOf(project(accounts, schedule, reached), {
      accounts,
      plan: reached,
      schedule,
    });
    const { rerender } = render(board(reached));

    expect(screen.getByText("At Retirement")).toBeInTheDocument();
    expect(
      screen.getByText("Liquid net worth · 2049 · age 57"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(formatGbp(measured[2049 - 2026]?.liquid ?? 0)),
    ).toHaveClass("figure");
    expect(
      within(screen.getByRole("group", { name: "Milestones" })).getByRole(
        "button",
        { name: "Retirement 2049", pressed: true },
      ),
    ).toBeInTheDocument();
    expect(marks()).toStrictEqual(["2049"]);
    expect(
      screen.queryByRole("textbox", { name: "Retirement age" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("paragraph").map((line) => line.textContent),
    ).toStrictEqual(["Retirement · Liquid net worth ≥ 25 years of expenses"]);

    rerender(board(onConditions(10000)));

    const [tile] = screen.getAllByText(
      (_content, element) => element?.getAttribute("data-tone") === "inverse",
      { suggest: false },
    );

    expect(tile).toHaveTextContent(
      /^Retirement—yrsNot retired by the plan's end$/,
    );
    expect(marks()).toStrictEqual([]);
  });

  // Born in 1992 and retiring at 28, the owner retired in 2020, before
  // the plan's years: the tile reads the first milestone they reach,
  // and with none, keeps the retirement tile.
  it("reads the first milestone the plan's years reach once retirement is before them, and the retirement tile with none", () => {
    const retired = retiringAt(retiring, 28);
    const { rerender } = render(
      board(retired, schedule, { listed: milestones }),
    );

    expect(screen.getByText("At Kids leave home")).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Milestones" })).getAllByRole(
        "button",
      ),
    ).toHaveLength(2);

    rerender(board(retired, schedule));

    expect(screen.getByText("Retirement")).toBeInTheDocument();
    expect(screen.getByText("28")).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Milestones" }),
    ).not.toBeInTheDocument();
  });

  // The scenario retires at 61, in 2053, and the household it is set
  // against at 64, in 2056: the milestone tile reads the scenario at its
  // retirement against the household at its own, and the net worth tile
  // the scenario at the plan's end against the household at its own,
  // each in pounds; the chart draws the household's line over the
  // scenario's columns. Neither has a spread to draw the futures at, so
  // the chance carries nothing.
  it("reads each tile against the household it is set against, and draws the household's line", () => {
    const household = retiringAt(retiring, 64);
    const worthOf = (held: Plan, year: number): number => {
      const point = pointIn(held, year, schedule);
      return point === undefined
        ? 0
        : Object.values(worthsIn(point, accounts)).reduce(
            (sum, worth) => sum + worth,
            0,
          );
    };
    const signed = (value: number): string =>
      `${value < 0 ? "−" : "+"}${formatGbp(Math.abs(value))}`;
    render(
      <ProjectionBoard
        accounts={accounts}
        against={{
          accounts,
          milestones: [],
          plan: household,
          schedule,
          spread: short,
        }}
        milestones={[]}
        plan={retiring}
        scenario={null}
        schedule={schedule}
        spread={short}
      />,
    );

    expect(
      screen.getByText(
        signed(worthOf(retiring, 2053) - worthOf(household, 2056)),
      ),
    ).toHaveClass("figure");
    expect(
      screen.getByText(
        signed(worthOf(retiring, 2083) - worthOf(household, 2083)),
      ),
    ).toHaveClass("figure");
    expect(screen.queryByText(/pp$/)).not.toBeInTheDocument();
    expect(
      screen.getAllByText(
        (_content, element) =>
          element?.classList.contains("recharts-line") === true,
        { suggest: false },
      ),
    ).toHaveLength(1);
  });

  // A household retired before its plan starts has no retirement in its
  // years for the scenario's to be read against, and a scenario retired
  // before its own keeps the retirement tile, which carries nothing; the
  // net worth is read against the household's either way.
  it("reads the milestone tile against nothing where either has no milestone in its years", () => {
    // A delta in whole pounds, signed, which an axis label, shortened to
    // thousands or millions, never is.
    const deltas = (): readonly string[] =>
      screen
        .queryAllByText(/^[+−]£[\d,]+$/)
        .map(({ textContent }) => textContent);
    const set = (scenario: Plan, household: Plan): JSX.Element => (
      <ProjectionBoard
        accounts={accounts}
        against={{
          accounts,
          milestones: [],
          plan: household,
          schedule,
          spread: short,
        }}
        milestones={[]}
        plan={scenario}
        scenario={null}
        schedule={schedule}
        spread={short}
      />
    );
    const { rerender } = render(set(retiring, retiringAt(retiring, 28)));

    expect(screen.getByText("At Retirement")).toBeInTheDocument();
    expect(deltas()).toHaveLength(1);

    rerender(set(retiringAt(retiring, 28), retiring));

    expect(screen.getByText("Retirement")).toBeInTheDocument();
    expect(deltas()).toHaveLength(1);
  });
});
