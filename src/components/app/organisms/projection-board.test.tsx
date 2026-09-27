import type { JSX } from "react";

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Milestone } from "@/data/milestones";
import type { Plan } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";

import { saveAges } from "@/actions/plan";
import { toast } from "@/components/kit/toast";
import { accounts } from "@/data/accounts.fixture";
import { kept } from "@/data/household.fixture";
import { retiring } from "@/data/income.fixture";
import { project } from "@/engine/projection";
import { refused } from "@/lib/answer";
import { formatGbp } from "@/lib/money";
import { commit, slider } from "@/test/dom";

import { ProjectionBoard, settle } from "./projection-board";

vi.mock("@/actions/plan", () => ({ saveAges: vi.fn() }));
vi.mock("@/components/kit/toast", () => ({ toast: { add: vi.fn() } }));

const { milestones, schedule } = kept;

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
// 2083, when they are 91.
function board(
  held: Plan = retiring,
  lines: Schedule = schedule,
  listed: readonly Milestone[] = [],
): JSX.Element {
  return (
    <ProjectionBoard
      accounts={accounts}
      milestones={listed}
      plan={held}
      schedule={lines}
    >
      <p>The other tiles</p>
    </ProjectionBoard>
  );
}

// The fixture's schedule with the retirement living starting in the
// year given.
function livingFrom(firstYear: number, isTied: boolean): Schedule {
  return {
    ...schedule,
    expenses: schedule.expenses.map((line) =>
      line.id === 4
        ? { ...line, firstYear, startsAt: isTied ? "retirement" : null }
        : line,
    ),
  };
}

// The total the chart gives for a year of a plan, as its tooltip
// writes it, over the fixture's schedule or the one given.
function totalIn(held: Plan, year: number, lines: Schedule = schedule): string {
  const point = project(accounts, lines, held).find(
    (candidate) => candidate.year === year,
  );
  return formatGbp((point?.deferred ?? 0) + (point?.free ?? 0));
}

// Types an age into the box and leaves it, which commits it.
function typeAge(age: string): void {
  const input = screen.getByRole("textbox", { name: "Retirement age" });
  commit(input, age);
}

describe("ProjectionBoard", () => {
  // Retirement is chosen to begin with: the tile reads the balance the
  // plan holds entering 2053, and the age's hint the year before it.
  it("leads the tiles with the milestone tile at retirement, charts the engine's projection marked there, and gives the last working year under the age", () => {
    render(board());

    expect(screen.getByText("At Retirement")).toBeInTheDocument();
    expect(screen.getByText(totalIn(retiring, 2053))).toHaveClass("figure");
    expect(screen.getByText("2053 · age 61")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Retirement age" }),
    ).toHaveAccessibleDescription("Last working year 2052");
    expect(
      within(screen.getByRole("group", { name: "Milestones" })).getByRole(
        "button",
        { name: "Retirement 2053", pressed: true },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("paragraph").map((line) => line.textContent),
    ).toStrictEqual(["The other tiles", "Last working year 2052"]);
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
  it("projects every figure at the age moved to, before it is saved", async () => {
    render(board());

    typeAge("34");

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    await screen.findByText("2028 · Age 36");

    const moved = totalIn({ ...retiring, retires: 34 }, 2028);

    expect(moved).not.toBe(totalIn(retiring, 2028));
    expect(screen.getByText(moved)).toHaveClass("figure");
    expect(marks()).toStrictEqual(["2026", "2031", "2034"]);
    expect(saveAges).not.toHaveBeenCalled();
  });

  // The retirement living is tied to start at retirement, so retiring
  // at 52 rather than 61 starts it in 2044 rather than 2053, and 2047
  // pays it beside the household spending that runs to 2051: the chart
  // gives the engine's figure for the line moved with the age, not the
  // one handed down.
  it("moves a line tied to retirement with the age moved to, before it is saved", async () => {
    render(board(retiring, livingFrom(2053, true)));

    typeAge("52");

    const chart = screen.getByRole("application");
    chart.focus();
    for (let step = 0; step < 21; step += 1) {
      fireEvent.keyDown(chart, { key: "ArrowRight" });
    }
    await screen.findByText("2047 · Age 55");

    const early = { ...retiring, retires: 52 };
    const moved = totalIn(early, 2047, livingFrom(2044, false));

    expect(moved).not.toBe(totalIn(early, 2047, livingFrom(2053, false)));
    expect(screen.getByText(moved)).toHaveClass("figure");
  });

  // The children leave home in 2040 and the downsize is in 2059, either
  // side of retirement in 2053, and each is marked beside it; the
  // retirement mark moves with the age as the others stay.
  it("marks every milestone the household lists beside retirement", () => {
    render(board(retiring, schedule, milestones));

    expect(marks()).toStrictEqual(["2040", "2053", "2059"]);

    fireEvent.keyDown(slider("Retirement age"), { key: "ArrowRight" });

    expect(marks()).toStrictEqual(["2040", "2054", "2059"]);
  });

  it("follows a dragged age at once and saves it once it has settled", () => {
    vi.useFakeTimers();
    render(board());

    fireEvent.keyDown(slider("Retirement age"), { key: "ArrowRight" });

    expect(screen.getByText("2054 · age 62")).toBeInTheDocument();
    expect(marks()).toStrictEqual(["2054"]);
    expect(saveAges).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(settle);
    });

    expect(saveAges).toHaveBeenCalledExactlyOnceWith({ retires: 62 });
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

    expect(screen.getByText("2056 · age 64")).toBeInTheDocument();
    expect(saveAges).toHaveBeenCalledExactlyOnceWith({ retires: 64 });
  });

  it("moves the tile and the mark to a typed age, and saves it", () => {
    vi.useFakeTimers();
    render(board());

    typeAge("55");
    act(() => {
      vi.advanceTimersByTime(settle);
    });

    expect(screen.getByText("2047 · age 55")).toBeInTheDocument();
    expect(marks()).toStrictEqual(["2047"]);
    expect(saveAges).toHaveBeenCalledExactlyOnceWith({ retires: 55 });
  });

  // Moved to 62 over the store's 61, the board is handed 64, saved from
  // somewhere else: its draft was drawn over an age that has gone, and
  // the store's is shown.
  it("shows the store's age once it moves past a draft", () => {
    const { rerender } = render(board());

    fireEvent.keyDown(slider("Retirement age"), { key: "ArrowRight" });

    expect(screen.getByText("2054 · age 62")).toBeInTheDocument();

    rerender(board({ ...retiring, retires: 64 }));

    expect(screen.getByText("2056 · age 64")).toBeInTheDocument();
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

    expect(screen.getByText("2053 · age 61")).toBeInTheDocument();
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

    expect(saveAges).toHaveBeenCalledExactlyOnceWith({ retires: 60 });

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
        schedule={schedule}
      >
        {null}
      </ProjectionBoard>,
    );

    expect(screen.getByText("Nothing to project yet")).toBeInTheDocument();
    expect(screen.getByText("Retirement")).toBeInTheDocument();
    expect(screen.getByText("Last working year 2052")).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Milestones" }),
    ).not.toBeInTheDocument();
  });

  // The children leave home in 2040, when the owner is 48: the tile
  // reads the plan then, and the chart draws that line solid. Moving
  // the age chooses retirement again, at the age moved to.
  it("reads the plan at the milestone a chip chooses, and at retirement again once the age moves", () => {
    render(board(retiring, schedule, milestones));

    fireEvent.click(
      screen.getByRole("button", { name: "Kids leave home 2040" }),
    );

    expect(screen.getByText("At Kids leave home")).toBeInTheDocument();
    expect(screen.getByText(totalIn(retiring, 2040))).toHaveClass("figure");
    expect(screen.getByText("2040 · age 48")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Kids leave home 2040" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Retirement 2053" }),
    ).toHaveAttribute("aria-pressed", "false");

    fireEvent.keyDown(slider("Retirement age"), { key: "ArrowRight" });

    expect(screen.getByText("At Retirement")).toBeInTheDocument();
    expect(screen.getByText("2054 · age 62")).toBeInTheDocument();
  });

  // Born in 1992 and retiring at 28, the owner retired in 2020, before
  // the plan's years: the tile reads the first milestone they reach,
  // and with none, keeps the retirement tile.
  it("reads the first milestone the plan's years reach once retirement is before them, and the retirement tile with none", () => {
    const retired = { ...retiring, retires: 28 };
    const { rerender } = render(board(retired, schedule, milestones));

    expect(screen.getByText("At Kids leave home")).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Milestones" })).getAllByRole(
        "button",
      ),
    ).toHaveLength(2);

    rerender(board(retired, schedule, []));

    expect(screen.getByText("Retirement")).toBeInTheDocument();
    expect(screen.getByText("28")).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Milestones" }),
    ).not.toBeInTheDocument();
  });
});
