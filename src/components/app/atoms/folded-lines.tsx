import type { Route } from "next";
import type { JSX, ReactNode } from "react";

import { cn } from "cn";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

interface FoldedLinesProps {
  readonly children?: ReactNode;
  readonly figure: string;
  readonly href?: Route | undefined;
  readonly isFigureMuted?: boolean;
  readonly lock?: ReactNode;
  readonly name: string;
  readonly onOpen?: (() => void) | undefined;
}

// What makes the name open the row: its press covers the nearest box the
// caller positions, and its focus ring is drawn around what it covers.
const opener =
  "flex-1 text-left font-medium after:absolute after:inset-0 focus-visible:outline-hidden focus-visible:after:ring-3 focus-visible:after:ring-ring/50 focus-visible:after:ring-inset";

// A row of a ledger as a narrow width draws it: the name and the figure
// that matters most across the first line and the rest beneath, faint,
// a line apiece and wrapping where the line runs long. The lines are
// drawn into whatever box the caller folds a row into, a table's cell or
// a list's item, which is the box shown only while folded. Given
// something to open, the name is a button whose press covers the nearest
// box the caller positions, which is the whole row, with a chevron at
// the line's end saying so: a row folded has no room left for a pencil,
// so a tap anywhere on it opens it. The focus ring is drawn around what
// the button covers for the same reason. A row that opens nothing, a
// total, keeps the chevron's place unseen, so its figure lines up with
// the figures above it. The figure is held to one line, as every figure
// is, so a narrow row wraps the name rather than breaking a minus from
// its pounds. The first line and the lines beneath it are boxes, so a
// screen reader reads a pause between them rather than running the
// figure into the line after it, and what goes beneath may be a box
// itself. A row locked against editing here draws the lock it is given
// in the chevron's place instead, the lock its caller draws in the
// row's actions too, so a row that will not open says why rather than
// seeming not to answer; its caller gives it nothing to open, or the
// screen it is set on, which its name then links to, covering the row
// as the button does, so a tap goes where it can be changed. A figure
// its caller mutes in the row's column, as a target of nothing is, is
// muted here too.
export function FoldedLines({
  children,
  figure,
  href,
  isFigureMuted = false,
  lock,
  name,
  onOpen,
}: FoldedLinesProps): JSX.Element {
  return (
    <>
      <div className="flex items-baseline gap-3">
        {onOpen === undefined && href !== undefined && (
          <Link className={opener} href={href}>
            {name}
          </Link>
        )}
        {onOpen === undefined && href === undefined && (
          <span className="flex-1 font-medium">{name}</span>
        )}
        {onOpen !== undefined && (
          <button className={opener} onClick={onOpen} type="button">
            {name}
          </button>
        )}
        <span
          className={cn(
            "figure font-medium",
            isFigureMuted && "text-muted-foreground",
          )}
        >
          {figure}
        </span>
        {lock === undefined ? (
          <ChevronRight
            aria-hidden
            className={cn(
              "size-4 self-center text-muted-foreground",
              onOpen === undefined && "invisible",
            )}
          />
        ) : (
          <span className="self-center">{lock}</span>
        )}
      </div>
      {children !== undefined && (
        <div className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
          {children}
        </div>
      )}
    </>
  );
}
