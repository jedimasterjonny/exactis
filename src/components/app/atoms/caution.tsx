import type { JSX } from "react";

import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/kit/alert";

interface CautionProps {
  readonly children: string;
  readonly title: string;
}

// What a screen says above its regions when something it shows has
// been set aside for something typed by hand: the warning icon, a title
// saying what is live, and a sentence beneath saying what that costs,
// all in the caution tone, since it is a changed assumption rather than
// a fault. The loud counterpart of the note, which is muted. It stands
// across the top of a screen's regions, so it takes the room a card's
// edge gives rather than the registry's compact inline padding. It is
// there whenever the screen is, rather than arriving because something
// happened, so it is a note to a screen reader and not the registry's
// alert, which would break in to read it out on every visit.
export function Caution({ children, title }: CautionProps): JSX.Element {
  return (
    <Alert className="px-4 py-3" role="note" variant="caution">
      <TriangleAlert aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
