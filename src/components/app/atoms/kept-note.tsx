import type { JSX } from "react";

import { cn } from "cn";

interface KeptNoteProps {
  readonly className?: string;
  readonly note: string;
}

// The household's own note on a month, read back: one paragraph, the
// muted micro-label "Your note" and then the note in ink, so it reads as
// the household's words rather than the app's, as the Note atom's icon
// says the app is speaking. The label is held whole and joined to the
// note by a no-break space, so the text reads with a space and an
// unbroken note breaks after the label rather than inside it, and the
// note wraps anywhere, so it never runs past its box or widens a table.
// It is one paragraph rather than a label over one, since the folded
// years on Progress set a margin under every paragraph but the last.
// Each caller gives its own spacing.
export function KeptNote({ className, note }: KeptNoteProps): JSX.Element {
  return (
    <p className={cn("text-sm wrap-anywhere", className)}>
      <span className="mr-1 label whitespace-nowrap text-muted-foreground">
        Your note
      </span>
      {`\u00A0${note}`}
    </p>
  );
}
