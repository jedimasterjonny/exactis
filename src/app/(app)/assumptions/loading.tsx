import type { JSX } from "react";

import { Screen } from "@/components/app/templates/screen";
import { assumptions, sectionLabel } from "@/lib/nav";

// What the assumptions screen shows while the store answers: its
// header, which the shell can carry, and nothing beneath until there is
// a curve to lay out.
export default function Loading(): JSX.Element {
  return (
    <Screen
      label={sectionLabel(assumptions)}
      meta="Reading the store…"
      title={assumptions.title}
    />
  );
}
