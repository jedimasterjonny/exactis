import type { JSX, ReactNode } from "react";

import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/kit/alert";

interface CautionProps {
  readonly action?: ReactNode;
  readonly children?: string;
  readonly id?: string;
  readonly title: string;
}

// What a screen says above its regions when something it shows has
// been set aside for something typed by hand: the warning icon, a title
// saying what is live, and a sentence beneath saying what that costs
// where the title alone does not, all in the caution tone, since it is a changed assumption rather than
// a fault. The loud counterpart of the note, which is muted. It stands
// across the top of a screen's regions, so it takes the room a card's
// edge gives rather than the registry's compact inline padding. It is
// there whenever the screen is, rather than arriving because something
// happened, so it is a note to a screen reader and not the registry's
// alert, which would break in to read it out on every visit. An optional
// id lets a disabled control name it as its description, and an optional
// action sits aligned beneath the text in the second column.
export function Caution({
  action,
  children,
  id,
  title,
}: CautionProps): JSX.Element {
  return (
    <Alert className="px-4 py-3" id={id} role="note" variant="caution">
      <TriangleAlert aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      {children !== undefined && (
        <AlertDescription>{children}</AlertDescription>
      )}
      {action !== undefined && <div className="col-start-2 mt-2">{action}</div>}
    </Alert>
  );
}
