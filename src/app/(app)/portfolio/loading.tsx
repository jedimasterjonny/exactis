import type { JSX } from "react";

import { Screen } from "@/components/app/templates/screen";
import { portfolio, sectionLabel } from "@/lib/nav";

// The portfolio's header while the store checks the session, saying so.
export default function Loading(): JSX.Element {
  return (
    <Screen
      label={sectionLabel(portfolio)}
      meta="Opening portfolio…"
      title={portfolio.title}
    />
  );
}
