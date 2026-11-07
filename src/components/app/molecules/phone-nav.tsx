"use client";

import type { JSX } from "react";

import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { DueBadge } from "@/components/app/atoms/due-badge";
import { useSidebar } from "@/components/kit/sidebar";
import { monthEnd, screenAt, tabs } from "@/lib/nav";

interface PhoneNavProps {
  readonly isDue: Promise<boolean>;
}

// A tab and More alike: the full height of the bar and a fifth of its
// width, the icon over the label, muted until current, when the label
// is foreground and a rule in brand runs along the top. The focus ring is
// drawn inside, since the end cells meet the screen's edges.
const classes =
  "relative flex min-h-11 w-full flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground outline-none before:absolute before:inset-x-3 before:top-0 before:h-0.5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset aria-[current=page]:text-foreground aria-[current=page]:before:bg-brand data-current:text-foreground data-current:before:bg-brand [&_svg]:size-5";

// The bar along the foot of a phone's screen, below the md breakpoint: a
// tab for each screen in the tabs, then More, which opens the sidebar's
// sheet for the rest and everything below them. The current screen's
// tab is marked from the pathname, for the eye and as the page to a
// screen reader; on a screen reached through More, More is marked for
// the eye alone, since it opens the sheet rather than being the page,
// and where no screen is current, as on Compare, nothing is. The month
// end's tab carries a dot while last month is still to be closed, read
// from the promise the sidebar's badge reads. The tabs are links, so
// they work before the page hydrates; More is a button and waits for
// it. The tabs sit above the home indicator, the bar running on beneath
// them to the foot of the screen. A client component, since the pathname
// is read on the client.
export function PhoneNav({ isDue }: PhoneNavProps): JSX.Element {
  const screen = screenAt(usePathname());
  const { openMobile: isOpen, setOpenMobile } = useSidebar();
  const isMore = screen !== undefined && !tabs.includes(screen);
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
            onClick={() => {
              setOpenMobile(true);
            }}
            type="button"
          >
            <Ellipsis aria-hidden />
            <span className="whitespace-nowrap">More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
