"use client";

import type { JSX } from "react";

interface ScreenTitleProps {
  readonly children: string;
}

// The pathname a title last arrived on, and the title last handed the
// focus. ponytail: kept for the module, so for one document drawing one
// screen's title at a time; a frame drawing two screens side by side
// would keep them for each.
let arrivedOn: string | undefined;
let handed: HTMLElement | null = null;

// Drops what was kept, as a page opening has nothing: for the tests,
// which each open on a page of their own.
export function forget(): void {
  arrivedOn = undefined;
  handed = null;
}

// A screen's title, the level-one heading in the heading face, which
// takes the focus when its screen is moved to, so the keyboard carries on
// from the top of the screen rather than from the link that moved it,
// which may be in a sheet now closed. It takes it as it arrives: a screen
// still on its way puts up its loading screen's title first, which takes
// it, and the page's own title takes it back once when it replaces that
// one, unless the user has moved it on since. It leaves the focus alone
// on the page's first load, on a move that changes only the search, on an
// address with a fragment, whose target Next scrolls to, and on a move
// made from a tab of the phone's bar that holds the focus, which keeps
// it, as a tab bar does; a tap in Safari focuses nothing, so there the
// title takes it. A choice in the sheet, which hands the focus back to
// More, still hands it on. A route Next keeps hidden draws its title
// again when it is shown, which is a move. Taking it does not scroll, so
// a screen shown again where it was left stays there. Next leaves the
// focus alone on a navigation, and says a later version may reset it, so
// a bump of next checks that the two do not compete. The title is never
// tabbed to, and is handed the focus too by a screen that takes away the
// control that had it. A client component, since a ref cannot cross from
// the server.
export function ScreenTitle({ children }: ScreenTitleProps): JSX.Element {
  return (
    <h1 className="heading text-3xl" ref={arrive} tabIndex={-1}>
      {children}
    </h1>
  );
}

function arrive(title: HTMLHeadingElement | null): void {
  // React calls a ref with null as its title leaves or its route is
  // hidden, by when the address has already moved.
  if (title === null) {
    return;
  }
  const { hash, pathname } = window.location;
  const focused = document.activeElement;
  const isMove = arrivedOn !== undefined && arrivedOn !== pathname;
  const isLost = focused === document.body && handed?.isConnected === false;
  const isOnTab = focused?.matches('[data-slot="phone-nav"] a') === true;
  arrivedOn = pathname;
  if ((isMove || isLost) && hash === "" && !isOnTab) {
    title.focus({ preventScroll: true });
    handed = title;
  }
}
