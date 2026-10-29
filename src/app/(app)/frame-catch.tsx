"use client";

import type { ErrorInfo } from "next/error";
import type { JSX, ReactNode } from "react";

import { catchError } from "next/error";

import { AppFrame } from "@/components/app/templates/app-frame";

import ScreenError from "./error";

interface FrameCatchProps {
  readonly sidebar: ReactNode;
}

// What the signed-in frame draws when something in it throws that no
// screen's boundary catches, as the banner's read of the scenario open
// does when the store fails it: the frame again, its sidebar as the
// layout drew it, with the error screen in the screen's place and no
// banner. The screens' boundary sits beneath the layout, and a boundary
// catches nothing its own segment's layout throws, so without this one
// such a failure took the whole page to Next's own. The screen goes
// with the banner even where its own reads came back, since a screen
// drawn without the banner could be edited by someone taking a scenario
// for the household.
export const FrameCatch = catchError(
  ({ sidebar }: FrameCatchProps, info: ErrorInfo): JSX.Element => (
    <AppFrame banner={null} sidebar={sidebar}>
      <ScreenError {...info} />
    </AppFrame>
  ),
);
