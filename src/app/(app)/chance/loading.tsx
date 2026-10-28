import type { JSX } from "react";

import { Screen } from "@/components/app/templates/screen";
import { chance, sectionLabel } from "@/lib/nav";

// The chance of success's header while the store answers, saying so.
export default function Loading(): JSX.Element {
  return (
    <Screen
      label={sectionLabel(chance)}
      meta="Reading the store…"
      title={chance.title}
    />
  );
}
