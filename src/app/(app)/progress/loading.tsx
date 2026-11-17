import type { JSX } from "react";

import { Download } from "lucide-react";

import { Screen } from "@/components/app/templates/screen";
import { Button } from "@/components/kit/button";
import { progress, sectionLabel } from "@/lib/nav";

// The progress screen's header while the store answers, saying so,
// with the pull of the house price index held until the page lands, so
// the header is the height it lands at where the pull wraps beneath the
// title.
export default function Loading(): JSX.Element {
  return (
    <Screen
      actions={
        <Button disabled size="sm" variant="outline">
          <Download aria-hidden />
          Pull house prices
        </Button>
      }
      label={sectionLabel(progress)}
      meta="Reading the store…"
      title={progress.title}
    />
  );
}
