import type { JSX } from "react";

import { Screen } from "@/components/app/templates/screen";
import { portfolio, sectionLabel } from "@/lib/nav";

// The portfolio's header while the store checks the session, reads any
// open scenario, and loads the household's stored portfolio file.
export default function Loading(): JSX.Element {
  return (
    <Screen
      label={sectionLabel(portfolio)}
      meta="Reading the store…"
      title={portfolio.title}
    />
  );
}
