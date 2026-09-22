import type { JSX, ReactNode } from "react";

import { useId } from "react";

import { SectionHeader } from "@/components/app/atoms/section-header";
import { Card, CardHeader } from "@/components/kit/card";

interface SectionCardProps {
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly label: string;
  readonly title: string;
}

// A card that is a region of its screen: the section header in the
// card's header, and the caller's content beneath it. The card is named
// by the header's title, so a screen reader can move from one region to
// the next as it could between tabs, which is what a screen laid out in
// sections rather than tabs would otherwise lose. The class is the
// caller's, for a card whose content runs to its bottom edge.
export function SectionCard({
  actions,
  children,
  className,
  label,
  title,
}: SectionCardProps): JSX.Element {
  const id = useId();
  return (
    <Card aria-labelledby={id} className={className} role="region">
      <CardHeader>
        <SectionHeader actions={actions} id={id} label={label} title={title} />
      </CardHeader>
      {children}
    </Card>
  );
}
