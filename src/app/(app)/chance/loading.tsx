import type { JSX } from "react";

import { RefreshCw } from "lucide-react";

import { Screen } from "@/components/app/templates/screen";
import { Button } from "@/components/kit/button";
import { chance, sectionLabel } from "@/lib/nav";

// The chance of success's header while the store answers, saying so,
// with Draw again held until the page lands, so the header is the
// height it lands at where the button wraps beneath the title.
export default function Loading(): JSX.Element {
  return (
    <Screen
      actions={
        <Button disabled size="sm" variant="outline">
          <RefreshCw aria-hidden />
          Draw again
        </Button>
      }
      label={sectionLabel(chance)}
      meta="Reading the store…"
      title={chance.title}
    />
  );
}
