import type { JSX } from "react";

import { Screen } from "@/components/app/templates/screen";
import { accountsAndAssets, sectionLabel } from "@/lib/nav";

// What the accounts screen shows while the store answers: its header,
// which the shell can carry, and nothing beneath until there are rows.
export default function Loading(): JSX.Element {
  return (
    <Screen
      label={sectionLabel(accountsAndAssets)}
      meta="Reading the store…"
      title={accountsAndAssets.title}
    />
  );
}
