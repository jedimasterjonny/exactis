import type { JSX } from "react";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Milestone } from "@/data/milestones";
import type { Future } from "@/engine/futures";

import { atAge } from "@/data/milestones";
import { working } from "@/data/owners.fixture";
import { drawAgain } from "@/hooks/use-futures";

import { ChanceTile } from "./chance-tile";

vi.mock("@/hooks/use-futures", () => ({ drawAgain: vi.fn() }));

// Born in 1992, from January 2026 over three years, so the plan runs to
// 37.
const plan = {
  born: 1992,
  from: 2026,
  inflation: 0,
  month: 0,
  owners: [working],
  rate: 0,
  retires: 92,
  years: 3,
};

// Ten futures over four years from 34, each worth £30,000 throughout,
// owing and spending nothing, the last two falling short in 2028.
const futures = Array.from({ length: 10 }, (_, nth): Future => ({
  fell: nth < 8 ? null : 2028,
  measured: Array.from({ length: 4 }, (_, offset) => ({
    age: 34 + offset,
    debt: 0,
    expenses: 0,
    liquid: 30000,
    loans: 0,
    worth: 30000,
  })),
  ranOut: nth < 8 ? null : 2028,
  retired: 2084,
}));

// A whole run of a thousand futures, the number given falling short in
// 2028, so a chance moves by a tenth of a point a future, as a run's
// does.
function thousand(short: number): Future[] {
  return Array.from({ length: 1000 }, (_, nth): Future => {
    const fell = nth < short ? 2028 : null;
    return { fell, measured: [], ranOut: fell, retired: 2084 };
  });
}

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
  { conditions: atAge(35), id: 3, name: "Ada 18" },
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
      screen.getByText("Of 1,000 futures, lasting to 37"),
    ).toBeInTheDocument();
  });

  // Eight in ten last, set against a household whose every future lasts,
  // so twenty points fewer; the difference's place held while either
  // run is still drawn; and nothing set against a household that has
  // nothing to draw.
  it("carries the difference from the household it is set against in percentage points once both runs are drawn", () => {
    const lasting = futures.map((future) => ({
      ...future,
      fell: null,
      ranOut: null,
    }));
    const { rerender } = render(
      <ChanceTile
        against={{ futures: lasting, isDone: true }}
        milestones={[]}
        plan={plan}
        run={{ futures, isDone: true }}
      />,
    );

    expect(screen.getByText("−20.00pp")).toHaveClass("figure");

    rerender(
      <ChanceTile
        against={{ futures: lasting.slice(0, 5), isDone: false }}
        milestones={[]}
        plan={plan}
        run={{ futures, isDone: true }}
      />,
    );

    expect(screen.queryByText(/pp$/)).not.toBeInTheDocument();
    expect(screen.getByText("…")).toHaveClass("figure");

    rerender(
      <ChanceTile
        against={{ futures: lasting, isDone: true }}
        milestones={[]}
        plan={plan}
        run={{ futures: futures.slice(0, 5), isDone: false }}
      />,
    );

    expect(screen.queryByText(/pp$/)).not.toBeInTheDocument();
    expect(screen.getAllByText("…")).toHaveLength(2);

    rerender(
      <ChanceTile
        against={{ unrun: "No spread to draw the futures from" }}
        milestones={[]}
        plan={plan}
        run={{ futures, isDone: true }}
      />,
    );

    expect(screen.queryByText(/pp$/)).not.toBeInTheDocument();
    expect(screen.queryByText("…")).not.toBeInTheDocument();
  });

  // Eight in ten last, said once as the run lands and not at the
  // hand-overs before it.
  it("says the chance once to a screen reader as the run lands, from a status there and empty from the first paint", () => {
    const { rerender } = render(
      <ChanceTile
        milestones={[]}
        plan={plan}
        run={{ futures: [], isDone: false }}
      />,
    );

    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    rerender(
      <ChanceTile
        milestones={[]}
        plan={plan}
        run={{ futures: futures.slice(0, 3), isDone: false }}
      />,
    );

    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    rerender(
      <ChanceTile
        milestones={[]}
        plan={plan}
        run={{ futures, isDone: true }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /^Chance of success 80%, of 1,000 futures lasting to 37$/v,
    );
  });

  // The household keeps 873 of a thousand futures: the scenario 852,
  // landing first and then last, then 894, then the household's 873.
  it("says a scenario's chance once both runs are drawn, whichever lands first, with how far it stands from the household's in words", () => {
    const household = thousand(127);
    // Each run drawn once all thousand are in.
    const tile = (against: Future[], run: Future[]): JSX.Element => (
      <ChanceTile
        against={{ futures: against, isDone: against.length === 1000 }}
        milestones={[]}
        plan={plan}
        run={{ futures: run, isDone: run.length === 1000 }}
      />
    );
    const { rerender } = render(tile([], []));

    rerender(tile(household.slice(0, 300), thousand(148)));

    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    rerender(tile(household, thousand(148)));

    expect(screen.getByRole("status")).toHaveTextContent(
      /^Chance of success 85%, of 1,000 futures lasting to 37, 2\.1 points below the household's$/v,
    );

    rerender(tile(household, thousand(106).slice(0, 300)));

    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    rerender(tile(household, thousand(106)));

    expect(screen.getByRole("status")).toHaveTextContent(
      /^Chance of success 89%, of 1,000 futures lasting to 37, 2\.1 points above the household's$/v,
    );

    rerender(tile(household, []));
    rerender(tile(household, household));

    expect(screen.getByRole("status")).toHaveTextContent(
      /^Chance of success 87%, of 1,000 futures lasting to 37, the same as the household's$/v,
    );
  });

  // Back on the dashboard over both runs kept, nothing has changed to be
  // said, and the tile is read where it is met.
  it("says nothing as it opens over runs already drawn", () => {
    render(
      <ChanceTile
        against={{ futures: thousand(127), isDone: true }}
        milestones={[]}
        plan={plan}
        run={{ futures, isDone: true }}
      />,
    );

    expect(screen.getByText("80%")).toHaveClass("figure");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
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
    expect(screen.getByText("Drawing 3 of 1,000…")).toBeInTheDocument();
    // The caption the chance lands on, held unseen beneath the count.
    expect(screen.getByText("Of 1,000 futures, lasting to 37")).toHaveClass(
      "invisible",
    );
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
  // at 34; none ever reaches £40,000.
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
    expect(screen.getByText("34")).toHaveClass("figure");
    expect(screen.getByText("yrs")).toBeInTheDocument();
    expect(
      screen.getByText("Reached in 0% of the futures"),
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
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("Forty grand")).toHaveClass("label");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
