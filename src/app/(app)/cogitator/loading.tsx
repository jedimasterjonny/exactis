import type { JSX } from "react";

import { Screen } from "@/components/app/templates/screen";
import { cogitator, sectionLabel } from "@/lib/nav";

// The cogitator's header while the store answers, saying so.
export default function Loading(): JSX.Element {
  return (
    <Screen
      label={sectionLabel(cogitator)}
      meta="Reading the store…"
      title={cogitator.title}
    />
  );
}
