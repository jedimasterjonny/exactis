import type { JSX } from "react";

import type { Run } from "@/components/app/organisms/chance-tile";
import type { Account } from "@/data/accounts";
import type { Shortfall } from "@/data/cma";
import type { Plan, Spread } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";

import { takesSpare } from "@/data/accounts";
import { runLength } from "@/engine/futures";
import { useFutures } from "@/hooks/use-futures";

// What the futures are drawn over, and what is drawn over the run they
// make, as far as it has been drawn, or why it cannot be.
interface FuturesRunProps {
  readonly accounts: readonly Account[];
  readonly children: (run: Run) => JSX.Element;
  readonly plan: Plan;
  readonly schedule: Schedule;
  readonly spread: Shortfall | Spread;
}

// What is drawn over a plan's run of the futures: the futures as they
// are drawn, or why there are none, while the plan has no spread or no
// savings for them to grow. The gate sits in front of the hook, which is
// never called on a condition, so a screen drawing a second run beside
// the first, as one setting a scenario against the household does, draws
// a second of these.
export function FuturesRun({
  children,
  spread,
  ...props
}: FuturesRunProps): JSX.Element {
  if ("short" in spread) {
    return children({ unrun: "No spread to draw the futures from" });
  }
  if (!props.accounts.some(takesSpare)) {
    return children({ unrun: "No savings for the futures to grow" });
  }
  return (
    <Drawn {...props} spread={spread}>
      {children}
    </Drawn>
  );
}

// What is drawn over the futures as they are drawn, at the spread
// given, in a component of its own so the hook is called on every
// render it is drawn in.
function Drawn({
  children,
  spread,
  ...props
}: Omit<FuturesRunProps, "spread"> & { readonly spread: Spread }): JSX.Element {
  const { futures, isDone } = useFutures(props.accounts, props.schedule, {
    count: runLength,
    plan: props.plan,
    spread,
  });
  return children({ futures, isDone });
}
