import type { JSX } from "react";

import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { assumptions, sectionLabel } from "@/lib/nav";

// What the assumptions screen shows while the store answers: its
// header, which the shell can carry, and nothing beneath until there is
// a curve to lay out.
export default function Loading(): JSX.Element {
  return (
    <ScreenHeader label={sectionLabel(assumptions)} title={assumptions.title}>
      Reading the store…
    </ScreenHeader>
  );
}
