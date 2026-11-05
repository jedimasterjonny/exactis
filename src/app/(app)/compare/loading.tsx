import type { JSX } from "react";

import { Screen } from "@/components/app/templates/screen";
import { dashboard, sectionLabel } from "@/lib/nav";

// Compare's header while the store answers, saying so, under the title
// it gives before it knows which scenario it sets beside the household.
export default function Loading(): JSX.Element {
  return (
    <Screen
      label={sectionLabel(dashboard)}
      meta="Reading the store…"
      title="Scenario beside the household"
    />
  );
}
