import type { JSX, ReactNode } from "react";

import { useId } from "react";

import type { Slot } from "@/lib/slot";

import { SectionHeader } from "@/components/app/atoms/section-header";
import { Card, CardHeader } from "@/components/kit/card";

interface SectionCardProps {
  readonly actions?: Slot;
  readonly caption?: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly controls?: Slot;
  readonly label: string;
  readonly title: string;
}

// A card that is a region of its screen: the section header in the
// card's header, with the caption as its meta line when there is one,
// and the caller's content beneath it. The card is named
// by the header's title, so a screen reader can move from one region to
// the next as it could between tabs, which is what a screen laid out in
// sections rather than tabs would otherwise lose. The class is the
// caller's, for a card whose content runs to its bottom edge. Controls
// that set what the whole card shows, as the cash-flow card's year
// does, sit in the header beneath the section header, set apart from
// it, rather than in the content they steer.
export function SectionCard({
  actions,
  caption,
  children,
  className,
  controls,
  label,
  title,
}: SectionCardProps): JSX.Element {
  const id = useId();
  return (
    <Card aria-labelledby={id} className={className} role="region">
      <CardHeader className={controls === undefined ? undefined : "gap-4"}>
        <SectionHeader actions={actions} id={id} label={label} title={title}>
          {caption}
        </SectionHeader>
        {controls}
      </CardHeader>
      {children}
    </Card>
  );
}
