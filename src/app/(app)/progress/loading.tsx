import type { JSX } from "react";

import { Screen } from "@/components/app/templates/screen";
import { progress, sectionLabel } from "@/lib/nav";

// The progress screen's header while the store answers, saying so.
export default function Loading(): JSX.Element {
  return (
    <Screen
      label={sectionLabel(progress)}
      meta="Reading the store…"
      title={progress.title}
    />
  );
}
