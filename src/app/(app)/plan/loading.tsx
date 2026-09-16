import type { JSX } from "react";

import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { plan, sectionLabel } from "@/lib/nav";

// What the plan screen shows while the store answers: its header, which
// the shell can carry, and nothing beneath until there are lines.
export default function Loading(): JSX.Element {
  return (
    <ScreenHeader label={sectionLabel(plan)} title="Income & expenses">
      Reading the store…
    </ScreenHeader>
  );
}
