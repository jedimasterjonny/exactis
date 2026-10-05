import type { JSX } from "react";

import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { chance, sectionLabel } from "@/lib/nav";

// The chance of success's header while the store answers, saying so.
export default function Loading(): JSX.Element {
  return (
    <ScreenHeader label={sectionLabel(chance)} title={chance.title}>
      Reading the store…
    </ScreenHeader>
  );
}
