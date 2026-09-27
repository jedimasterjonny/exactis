import type { JSX, ReactNode } from "react";

import { cn } from "cn";
import { useRef } from "react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/kit/dialog";

interface DialogFrameProps {
  readonly children: ReactNode;
  readonly eyebrow: string;
  readonly footer: ReactNode;
  readonly isWide?: boolean;
  readonly onDismiss: () => void;
  readonly title: string;
}

// The frame a dialog in the product is drawn in, whatever it asks: an
// eyebrow in the brand colour saying what the dialog is for, the title
// naming what it is open on, what the caller gives, and the caller's
// buttons beneath. It is open for as long as it is mounted, so a caller
// renders it while it holds something to show and not otherwise. It
// opens only from state, so the only change it can report is a close:
// Escape, a press outside or its cross, all of which dismiss, and a
// caller's own button that closes it calls the same. A wide frame fits
// a form of three columns.
// The frame is held to the height of the screen, less the margin it
// keeps at the sides, and what the caller gives scrolls between the
// title and the footer, which stay where they are: a form taller than a
// phone ran off both ends of it, taking the title and the buttons with
// it, and scrolled nowhere. What scrolls keeps the dialog's gap between
// its parts, as it had before there was a box to scroll in.
// The footer is one row at every width, where the registry's stacks its
// buttons the width of the dialog on a phone: the edit dialog's three,
// held on screen, took a fifth of it from the fields.
// Opened on a touch screen, the frame takes the focus itself rather
// than handing it to its first field, which opened the keyboard over
// half the form before anything was asked of it; Base UI does the same
// for a dialog its trigger opens by touch, but these open from state,
// with no trigger to tell it how. A mouse or a keyboard still lands in
// the first field, ready to type.
export function DialogFrame({
  children,
  eyebrow,
  footer,
  isWide = false,
  onDismiss,
  title,
}: DialogFrameProps): JSX.Element {
  const popupRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog onOpenChange={onDismiss} open>
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto]",
          isWide && "sm:max-w-lg",
        )}
        initialFocus={() => (isTouch() ? popupRef.current : true)}
        ref={popupRef}
      >
        <DialogHeader>
          <span className="label text-brand">{eyebrow}</span>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="-mx-4 -my-1 grid content-start gap-4 overflow-y-auto px-4 py-1">
          {children}
        </div>
        <DialogFooter className="flex-row justify-end">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Whether the screen is worked by touch, where a field focused unasked
// opens the keyboard. A browser that cannot say is taken to have a
// mouse, which is what jsdom, having no working matchMedia, has.
function isTouch(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}
