import type { JSX } from "react";

import { leaveScenario } from "@/actions/scenarios";
import { Button } from "@/components/kit/button";

interface ScenarioBannerProps {
  readonly name: string;
}

// The bar across the top of every screen while a scenario is open,
// naming it in the caution tone, since an edit made beneath it is kept
// in the scenario rather than the household, with the way back to the
// household beside it. Leaving is a form posting to its action, as the
// sidebar's sign-out is, so it works before the page hydrates. It is
// there whenever the scenario is, rather than arriving because
// something happened, so it is a note to a screen reader rather than a
// status read out on every visit.
export function ScenarioBanner({ name }: ScenarioBannerProps): JSX.Element {
  return (
    <div
      className="flex items-center gap-3 border-b bg-caution/10 px-4 py-1.5 text-caution dark:bg-caution/20"
      role="note"
    >
      <span className="truncate label">Scenario · {name}</span>
      <form
        action={leaveScenario}
        aria-label="Leave the scenario"
        className="ml-auto"
      >
        <Button size="sm" type="submit" variant="ghost">
          Leave
        </Button>
      </form>
    </div>
  );
}
