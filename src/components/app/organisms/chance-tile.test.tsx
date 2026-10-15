import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Milestone } from "@/data/milestones";
import type { Future } from "@/engine/futures";

import { atAge } from "@/data/milestones";
import { working } from "@/data/owners.fixture";
import { drawAgain } from "@/hooks/use-futures";

import { ChanceTile } from "./chance-tile";

vi.mock("@/hooks/use-futures", () => ({ drawAgain: vi.fn() }));

// Born in 1990, from January 2026 over three years, so the plan runs to
// 39.
const plan = {
  born: 1990,
  from: 2026,
  inflation: 0,
  month: 0,
  owners: [working],
  rate: 0,
  retires: 90,
  years: 3,
};

// Ten futures over four years from 36, each worth £30,000 throughout,
// owing and spending nothing, the last two falling short in 2028.
const futures = Array.from({ length: 10 }, (_, nth): Future => ({
  fell: nth < 8 ? null : 2028,
  measured: Array.from({ length: 4 }, (_, offset) => ({
    age: 36 + offset,
    debt: 0,
    expenses: 0,
    liquid: 30000,
    worth: 30000,
  })),
  ranOut: nth < 8 ? null : 2028,
  retired: 2080,
}));

// Thirty grand, which every future reaches at once; forty, which none
// ever does; and a milestone reached at an age, which has no tile.
const milestones: readonly Milestone[] = [
  {
    conditions: [{ measure: "worth", of: "pounds", times: 30000 }],
    id: 1,
    name: "Thirty grand",
  },
  {
    conditions: [{ measure: "worth", of: "pounds", times: 40000 }],
    id: 2,
    name: "Forty grand",
  },
  { conditions: atAge(37), id: 3, name: "Ada 18" },
];

describe("ChanceTile", () => {
  // Eight in ten last.
  it("shows the share of the futures that last once the run is drawn, with how many and to what age", () => {
    render(
      <ChanceTile
        milestones={[]}
        plan={plan}
        run={{ futures, isDone: true }}
      />,
    );

    expect(screen.getByText("Chance of success")).toHaveClass("label");
    expect(screen.getByText("80%")).toHaveClass("figure");
    expect(
      screen.getByText("Of 1,000 futures, lasting to 39"),
    ).toBeInTheDocument();
  });

  it("says how many futures are drawn while the run is, for the chance and for each milestone", () => {
    render(
      <ChanceTile
        milestones={milestones}
        plan={plan}
        run={{ futures: futures.slice(0, 3), isDone: false }}
      />,
    );

    expect(screen.getAllByText("…")).toHaveLength(3);
    expect(screen.getByText("Drawing 3 of 1,000 futures…")).toBeInTheDocument();
    expect(screen.getAllByText("Drawing the futures…")).toHaveLength(2);
    expect(screen.queryByText("Ada 18")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Draw the futures again" }),
    ).toHaveLength(3);
  });

  it("draws the futures again from the corner of every tile the run is read on", () => {
    render(
      <ChanceTile
        milestones={milestones}
        plan={plan}
        run={{ futures, isDone: true }}
      />,
    );

    for (const button of screen.getAllByRole("button", {
      name: "Draw the futures again",
    })) {
      fireEvent.click(button);
    }

    expect(drawAgain).toHaveBeenCalledTimes(3);
  });

  // Worth £30,000 as it opens, every future reaches that much at once,
  // at 36; none ever reaches £40,000.
  it("tiles each milestone reached when conditions hold at the age half the futures reach it by, or a dash with the share that ever do", () => {
    render(
      <ChanceTile
        milestones={milestones}
        plan={plan}
        run={{ futures, isDone: true }}
      />,
    );

    expect(screen.getByText("Thirty grand")).toHaveClass("label");
    expect(
      screen.getByText("Median of 1,000 futures · 2026"),
    ).toBeInTheDocument();
    expect(screen.getByText("36")).toHaveClass("figure");
    expect(screen.getByText("yrs")).toBeInTheDocument();
    expect(
      screen.getByText("Reached in 0% of 1,000 futures"),
    ).toBeInTheDocument();
    expect(screen.getByText("—")).toHaveClass("figure");
  });

  it("shows a dash, saying why, with nothing to draw the futures at", () => {
    render(
      <ChanceTile
        milestones={milestones}
        plan={plan}
        run={{ unrun: "No spread to draw the futures from" }}
      />,
    );

    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(
      screen.getAllByText("No spread to draw the futures from"),
    ).toHaveLength(3);
    expect(screen.getByText("Forty grand")).toHaveClass("label");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
