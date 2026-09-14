import type { JSX } from "react";

import { ScreenHeader } from "@/components/screen-header";

export default function Home(): JSX.Element {
  return (
    <main>
      <ScreenHeader label="Sect. I · Dashboard" title="Projected to age 89">
        {"Figures in today's money"}
      </ScreenHeader>
    </main>
  );
}
