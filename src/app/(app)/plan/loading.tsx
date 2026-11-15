import type { JSX } from "react";

import { Screen } from "@/components/app/templates/screen";
import { plan, sectionLabel } from "@/lib/nav";

// What the plan screen shows while the store answers: its header, which
// the shell can carry, and nothing beneath until there are lines. The
// sentence and the cards land beneath it together, and the page's meta
// line is one line as this one is, so the header holds its height.
export default function Loading(): JSX.Element {
  return (
    <Screen
      label={sectionLabel(plan)}
      meta="Reading the store…"
      title={plan.title}
    />
  );
}
