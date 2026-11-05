import type { JSX } from "react";

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import type { Run } from "@/components/app/organisms/chance-tile";
import type { Account } from "@/data/accounts";

import { accounts } from "@/data/accounts.fixture";
import { retiring } from "@/data/income.fixture";
import { retiringAt } from "@/data/milestones";
import { forget } from "@/hooks/use-futures";
import { stubWorkers } from "@/test/futures-worker";

import { FuturesRun } from "./futures-run";

// An ISA of £30,000, which takes what the plan has spare, and the
// fixture's home, which does not.
const isa: Account = {
  balance: 30000,
  growth: { kind: "plan" },
  id: 1,
  kind: "tax-free",
  name: "ISA",
  owner: 1,
};
const [, , , home] = accounts;

// The fixture's plan run for three years, retiring past its end, so a
// run of a thousand futures draws quickly.
const plan = { ...retiringAt(retiring, 92), years: 3 };

// What a run is as far as it has been drawn, as the caller is handed it.
function said(run: Run): JSX.Element {
  if ("unrun" in run) {
    return <p>{run.unrun}</p>;
  }
  return (
    <p>{`${String(run.futures.length)} drawn${run.isDone ? ", all" : ""}`}</p>
  );
}

describe("FuturesRun", () => {
  beforeEach(() => {
    forget();
  });

  it("says there is nothing to draw with no spread, or no savings for the futures to grow", () => {
    const { rerender } = render(
      <FuturesRun
        accounts={[isa]}
        plan={plan}
        schedule={{ expenses: [], income: [] }}
        spread={{ short: "No CMA is pulled" }}
      >
        {said}
      </FuturesRun>,
    );

    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "No spread to draw the futures from",
    );

    rerender(
      <FuturesRun
        accounts={[home]}
        plan={plan}
        schedule={{ expenses: [], income: [] }}
        spread={{ inflation: 0, rate: 0 }}
      >
        {said}
      </FuturesRun>,
    );

    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "No savings for the futures to grow",
    );
  });

  it("hands down the futures as they are drawn, and says once they all are", async () => {
    stubWorkers();
    render(
      <FuturesRun
        accounts={[isa, home]}
        plan={plan}
        schedule={{ expenses: [], income: [] }}
        spread={{ inflation: 0, rate: 0 }}
      >
        {said}
      </FuturesRun>,
    );

    const run = screen.getByRole("paragraph");

    expect(run).toHaveTextContent("0 drawn");

    await waitFor(
      () => {
        expect(run).toHaveTextContent("1000 drawn, all");
      },
      { timeout: 5000 },
    );
  });
});
