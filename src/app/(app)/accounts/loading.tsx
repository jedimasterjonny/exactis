import type { JSX } from "react";

import { ScreenHeader } from "@/components/screen-header";
import { accountsAndAssets, sectionLabel } from "@/lib/nav";

// What the accounts screen shows while the store answers: its header,
// which the shell can carry, and nothing beneath until there are rows.
export default function Loading(): JSX.Element {
  return (
    <ScreenHeader
      label={sectionLabel(accountsAndAssets)}
      title="Accounts & assets"
    >
      Reading the store…
    </ScreenHeader>
  );
}
