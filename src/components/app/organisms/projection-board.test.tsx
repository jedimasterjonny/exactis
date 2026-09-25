import type { JSX } from "react";

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Plan } from "@/data/plan";

import { saveAges } from "@/actions/plan";
import { toast } from "@/components/kit/toast";
import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines, plan } from "@/data/income.fixture";
import { project } from "@/engine/projection";
import { refused } from "@/lib/answer";
import { formatGbp } from "@/lib/money";

import { ProjectionBoard, settle } from "./projection-board";

vi.mock("@/actions/plan", () => ({ saveAges: vi.fn() }));
vi.mock("@/components/kit/toast", () => ({ toast: { add: vi.fn() } }));

const schedule = { expenses: expenseLines, income: incomeLines };

// Born in 1990 and retiring at 59, the plan's owner retires in 2049,
// within the fixture's plan from 2026, when they are 36, to 2079, when
// they are 89.
const retiring: Plan = { ...plan, retires: 59 };

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

function board(held: Plan = retiring): JSX.Element {
  return (
    <ProjectionBoard accounts={accounts} plan={held} schedule={schedule}>
      <p>The other tiles</p>
    </ProjectionBoard>
  );
}

// The slider is asked for by the group the field's label names, and
// whether or not it is shown, as the age field's own tests explain.
function slider(): HTMLElement {
  return within(
    screen.getByRole("group", { name: "Retirement age" }),
  ).getByRole("slider", { hidden: true });
}

// The total the chart gives for a year of a plan, as its tooltip
// writes it.
function totalIn(held: Plan, year: number): string {
  const point = project(accounts, schedule, held).find(
    (candidate) => candidate.year === year,
  );
  return formatGbp((point?.deferred ?? 0) + (point?.free ?? 0));
}

// Types an age into the box and leaves it, which commits it.
function typeAge(age: string): void {
  const input = screen.getByRole("textbox", { name: "Retirement age" });
  fireEvent.change(input, { target: { value: age } });
  fireEvent.blur(input);
}

describe("ProjectionBoard", () => {
  it("leads the tiles with the retirement tile and charts the engine's projection, marked where its owner retires", () => {
    render(board());

    expect(screen.getByText("Last working year 58")).toBeInTheDocument();
    expect(screen.getByRole("paragraph")).toHaveTextContent("The other tiles");
    expect(screen.getByRole("application")).toHaveClass("recharts-surface");
    expect(marks()).toStrictEqual(["2049"]);
    expect(screen.getByRole("textbox", { name: "Retirement age" })).toHaveValue(
      "59",
    );
    expect(slider()).toHaveAttribute("min", "36");
    expect(slider()).toHaveAttribute("max", "89");
  });

  // Retiring at 36 stops the salary from 2026, so 2028 opens on less
  // than it does retiring at 59, and the chart's figure for it is the
  // engine's for the age moved to rather than the age handed down. With
  // no salary the plan draws a pension early in 2033 and runs out in
  // 2037, and the chart marks both beside the retirement in 2026.
  it("projects every figure at the age moved to, before it is saved", async () => {
    render(board());

    typeAge("36");

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    await screen.findByText("2028 · Age 38");

    const moved = totalIn({ ...retiring, retires: 36 }, 2028);

    expect(moved).not.toBe(totalIn(retiring, 2028));
    expect(screen.getByText(moved)).toHaveClass("figure");
    expect(marks()).toStrictEqual(["2026", "2033", "2037"]);
    expect(saveAges).not.toHaveBeenCalled();
  });

  it("follows a dragged age at once and saves it once it has settled", () => {
    vi.useFakeTimers();
    render(board());

    fireEvent.keyDown(slider(), { key: "ArrowRight" });

    expect(screen.getByText("Last working year 59")).toBeInTheDocument();
    expect(marks()).toStrictEqual(["2050"]);
    expect(saveAges).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(settle);
    });

    expect(saveAges).toHaveBeenCalledExactlyOnceWith({ retires: 60 });
  });

  it("saves a run of arrow steps once, at the age they stop on", () => {
    vi.useFakeTimers();
    render(board());

    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    act(() => {
      vi.advanceTimersByTime(settle);
    });

    expect(screen.getByText("Last working year 61")).toBeInTheDocument();
    expect(saveAges).toHaveBeenCalledExactlyOnceWith({ retires: 62 });
  });

  it("moves the tile and the mark to a typed age, and saves it", () => {
    vi.useFakeTimers();
    render(board());

    typeAge("55");
    act(() => {
      vi.advanceTimersByTime(settle);
    });

    expect(screen.getByText("Last working year 54")).toBeInTheDocument();
    expect(marks()).toStrictEqual(["2045"]);
    expect(saveAges).toHaveBeenCalledExactlyOnceWith({ retires: 55 });
  });

  // Moved to 60 over the store's 59, the board is handed 62, saved from
  // somewhere else: its draft was drawn over an age that has gone, and
  // the store's is shown.
  it("shows the store's age once it moves past a draft", () => {
    const { rerender } = render(board());

    fireEvent.keyDown(slider(), { key: "ArrowRight" });

    expect(screen.getByText("Last working year 59")).toBeInTheDocument();

    rerender(board({ ...retiring, retires: 62 }));

    expect(screen.getByText("Last working year 61")).toBeInTheDocument();
    expect(marks()).toStrictEqual(["2052"]);
  });

  it("puts the store's age back and says why when the store refuses it", async () => {
    vi.useFakeTimers();
    vi.mocked(saveAges).mockResolvedValue(
      refused("A plan's owner retires no later than it ends"),
    );
    render(board());

    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(settle);
    });

    expect(screen.getByText("Last working year 58")).toBeInTheDocument();
    expect(marks()).toStrictEqual(["2049"]);
    expect(toast.add).toHaveBeenCalledExactlyOnceWith({
      description: "A plan's owner retires no later than it ends",
      title: "Retirement age not saved",
      type: "error",
    });
  });

  it("sends a save still waiting when the board is taken down", () => {
    vi.useFakeTimers();
    const { unmount } = render(board());

    fireEvent.keyDown(slider(), { key: "ArrowLeft" });
    unmount();

    expect(saveAges).toHaveBeenCalledExactlyOnceWith({ retires: 58 });

    vi.advanceTimersByTime(settle);

    expect(saveAges).toHaveBeenCalledOnce();
  });

  it("keeps the retirement tile over a projection of nothing", () => {
    render(
      <ProjectionBoard accounts={[]} plan={retiring} schedule={schedule}>
        {null}
      </ProjectionBoard>,
    );

    expect(screen.getByText("Nothing to project yet")).toBeInTheDocument();
    expect(screen.getByText("Last working year 58")).toBeInTheDocument();
  });
});
