import type { JSX } from "react";

import { Screen } from "@/components/app/templates/screen";
import { plan, sectionLabel } from "@/lib/nav";

// What the plan screen shows while the store answers: its header, which
// the shell can carry, and nothing beneath until there are lines.
export default function Loading(): JSX.Element {
  return (
    <Screen
      label={sectionLabel(plan)}
      meta="Reading the store…"
      title={plan.title}
    />
  );
}
