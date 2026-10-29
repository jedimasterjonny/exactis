import type { JSX, ReactNode } from "react";

import { cn } from "cn";

interface PanelProps {
  readonly "aria-labelledby"?: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly variant?: Variant;
}

type Variant = "default" | "subtle";

// The subtle panel is lighter and tighter, for one that sits in a card's
// flow holding row actions: a ghost button's hover is the muted ground,
// so on the full ground it would show nothing under the pointer.
const variants: Record<Variant, string> = {
  default: "gap-4 rounded-lg bg-muted p-5",
  subtle: "gap-3 rounded-md bg-muted/50 p-3",
};

// A sunken panel inside a card, its parts stacked at one gap on the
// muted ground. One named by its heading is a section, which a screen
// reader lists as a region; one with no name is a box, as a section
// unnamed would be anyway. Where it sits in the card is the caller's,
// through the class.
export function Panel({
  "aria-labelledby": labelledBy,
  children,
  className,
  variant = "default",
}: PanelProps): JSX.Element {
  const classes = cn("grid", variants[variant], className);
  return labelledBy === undefined ? (
    <div className={classes}>{children}</div>
  ) : (
    <section aria-labelledby={labelledBy} className={classes}>
      {children}
    </section>
  );
}
