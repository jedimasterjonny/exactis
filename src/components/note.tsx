import type { JSX } from "react";

import { Info } from "lucide-react";

interface NoteProps {
  readonly children: string;
}

// The muted note that closes a screen's section: the info icon and one
// sentence, with no panel behind it. The reference sets its notes on an
// info tint, but the palette's body records that an informational message
// is muted text, so the note is a paragraph and nothing more.
export function Note({ children }: NoteProps): JSX.Element {
  return (
    <p className="flex items-start gap-2 text-sm text-muted-foreground">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}
