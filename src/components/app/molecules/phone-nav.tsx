"use client";

import type { JSX } from "react";

import { cn } from "cn";
import { Ellipsis, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { signOut } from "@/actions/auth";
import { DueBadge } from "@/components/app/atoms/due-badge";
import { useSidebar } from "@/components/kit/sidebar";
import { monthEnd, screenAt, screens, sectionNumeral, tabs } from "@/lib/nav";

interface PhoneNavProps {
  readonly isDue: Promise<boolean>;
}

// A tab and More alike: the full height of the bar and a fifth of its
// width, the icon over the label, muted until current, when the label
// is foreground and a rule in brand runs along the top, in the system's
// text colour where colours are forced, which would paint it the
// page's. The focus ring is drawn inside, since the end cells meet the
// screen's edges, and where colours are forced, which take the ring
// away, an outline in the text colour is drawn inside in its place.
const classes =
  "relative flex min-h-11 w-full flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground outline-none before:absolute before:inset-x-3 before:top-0 before:h-0.5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset aria-[current=page]:text-foreground aria-[current=page]:before:bg-brand data-current:text-foreground data-current:before:bg-brand forced-colors:aria-[current=page]:before:bg-[CanvasText] forced-colors:data-current:before:bg-[CanvasText] forced-colors:focus-visible:-outline-offset-2 [&_svg]:size-5";

// A row of More's list: 44px tall for a thumb, the icon, the label and
// the numeral, the current screen in weight with a rail in brand at its
// start, in the system's text colour where colours are forced, and its
// focus drawn inside as a tab's is.
const rowClasses =
  "relative flex min-h-11 items-center gap-2 rounded-md px-3 text-sm outline-none before:absolute before:inset-y-2.5 before:left-0 before:w-0.5 before:rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset aria-[current=page]:font-medium aria-[current=page]:before:bg-brand forced-colors:aria-[current=page]:before:bg-[CanvasText] forced-colors:focus-visible:-outline-offset-2 [&_svg]:size-4";

// The screens More reaches: every screen the tabs leave out, in order.
const reached = screens.filter((screen) => !tabs.includes(screen));

// The bar along the foot of a phone's screen, below the md breakpoint: a
// tab for each screen in the tabs, then More, which opens the sidebar's
// sheet for the rest and everything below them. The current screen's
// tab is marked from the pathname, for the eye and as the page to a
// screen reader; on a screen reached through More, More is marked for
// the eye alone, since it opens the sheet rather than being the page,
// and where no screen is current, as on Compare, nothing is. The month
// end's tab carries a dot while last month is still to be closed, read
// from the promise the sidebar's badge reads. The tabs are links, so
// they work before the page hydrates. More opens the sheet once the page
// has hydrated, and before that a list of the screens it reaches, with
// sign-out beneath them, set apart, since it is the one action of the
// sheet's footer that works before the page hydrates, a native popover
// in a card above the bar at its end, which a tap outside or Escape
// closes and which stays shut where popovers are not drawn. Once the
// page has hydrated More's press is cancelled, so the list never opens
// over the sheet, and a move to another screen draws the list afresh,
// which closes one opened before the page hydrated. A move to another
// screen closes the sheet too, as back and forward make one, so the
// screen moved to is not left behind a sheet it did not open, its title
// holding the focus where the sheet hides it. The tabs sit above the
// home indicator, the bar running on beneath them to the foot of the
// screen. A client component, since the pathname is read on the client.
export function PhoneNav({ isDue }: PhoneNavProps): JSX.Element {
  const pathname = usePathname();
  const screen = screenAt(pathname);
  const { openMobile: isOpen, setOpenMobile } = useSidebar();
  const isMore = screen !== undefined && !tabs.includes(screen);
  useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);
  return (
    <nav
      aria-label="Tab bar"
      className="fixed inset-x-0 bottom-0 z-40 h-(--phone-nav) border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      data-slot="phone-nav"
    >
      <ul className="flex h-full">
        {tabs.map((tab) => (
          <li className="flex flex-1" key={tab.href}>
            <Link
              aria-current={screen === tab ? "page" : undefined}
              className={classes}
              href={tab.href}
            >
              <tab.icon aria-hidden />
              <span className="whitespace-nowrap">{tab.label}</span>
              {tab === monthEnd && (
                <DueBadge
                  className="top-1.5 left-[calc(50%+--spacing(1))]"
                  isDue={isDue}
                  shape="dot"
                />
              )}
            </Link>
          </li>
        ))}
        <li className="flex flex-1">
          <button
            aria-expanded={isOpen}
            aria-haspopup="dialog"
            className={classes}
            data-current={isMore ? "" : undefined}
            onClick={(event) => {
              event.preventDefault();
              setOpenMobile(true);
            }}
            popoverTarget="more-screens"
            type="button"
          >
            <Ellipsis aria-hidden />
            <span className="whitespace-nowrap">More</span>
          </button>
          <ul
            aria-label="More screens"
            className="fixed inset-auto right-[env(safe-area-inset-right)] bottom-(--phone-nav) m-2 hidden min-w-60 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md open:grid"
            id="more-screens"
            key={pathname}
            popover="auto"
          >
            {reached.map((item) => (
              <li key={item.href}>
                <Link
                  aria-current={screen === item ? "page" : undefined}
                  className={rowClasses}
                  href={item.href}
                >
                  <item.icon aria-hidden />
                  <span>{item.label}</span>
                  <span
                    aria-hidden
                    className="ml-auto label text-muted-foreground"
                  >
                    {sectionNumeral(item)}
                  </span>
                </Link>
              </li>
            ))}
            <li className="mt-1 border-t pt-1">
              <form action={signOut} aria-label="Sign out">
                <button className={cn(rowClasses, "w-full")} type="submit">
                  <LogOut aria-hidden />
                  Sign out
                </button>
              </form>
            </li>
          </ul>
        </li>
      </ul>
    </nav>
  );
}
