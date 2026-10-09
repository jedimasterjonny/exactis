import type { JSX } from "react";

import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { cogitator, sectionLabel } from "@/lib/nav";

// The cogitator's header while the store answers, saying so.
export default function Loading(): JSX.Element {
  return (
    <ScreenHeader label={sectionLabel(cogitator)} title={cogitator.title}>
      Reading the store…
    </ScreenHeader>
  );
}
