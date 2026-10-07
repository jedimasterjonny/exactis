import type { JSX } from "react";

import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { progress, sectionLabel } from "@/lib/nav";

// The progress screen's header while the store answers, saying so.
export default function Loading(): JSX.Element {
  return (
    <ScreenHeader label={sectionLabel(progress)} title={progress.title}>
      Reading the store…
    </ScreenHeader>
  );
}
