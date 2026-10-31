import type { JSX } from "react";

import { Screen } from "@/components/app/templates/screen";
import { monthEnd, sectionLabel } from "@/lib/nav";

// The month end's header while the store answers, saying so.
export default function Loading(): JSX.Element {
  return (
    <Screen
      label={sectionLabel(monthEnd)}
      meta="Reading the store…"
      title={monthEnd.title}
    />
  );
}
