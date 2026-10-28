import type { JSX, ReactNode } from "react";

import type { Slot } from "@/lib/slot";

import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";

interface ScreenProps {
  readonly actions?: Slot;
  readonly children?: ReactNode;
  readonly label: string;
  readonly meta?: Slot;
  readonly title: string;
}

// What every signed-in screen is inside the frame's main column: its
// header, with the line beneath its title and any action beside it, over
// its body. The body is drawn even when it is handed nothing, as a
// loading screen hands it nothing, because the template is the screen's
// structure whichever content fills it; an empty body is blank page either
// way.
export function Screen({
  actions,
  children,
  label,
  meta,
  title,
}: ScreenProps): JSX.Element {
  return (
    <>
      <ScreenHeader actions={actions} label={label} title={title}>
        {meta}
      </ScreenHeader>
      <ScreenBody>{children}</ScreenBody>
    </>
  );
}
