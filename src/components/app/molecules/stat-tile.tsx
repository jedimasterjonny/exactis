import type { LucideIcon } from "lucide-react";
import type { JSX } from "react";

import { cn } from "cn";

import type { DeltaFormat } from "@/components/app/atoms/delta-value";
import type { Slot } from "@/lib/slot";

import { DeltaValue } from "@/components/app/atoms/delta-value";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
} from "@/components/kit/card";

interface StatTileProps {
  readonly action?: Slot;
  readonly caption?: string;
  readonly delta?: null | number | undefined;
  readonly deltaFormat?: DeltaFormat;
  readonly holds?: string | undefined;
  readonly icon?: LucideIcon;
  readonly isHiddenOnPhone?: boolean;
  readonly label: string;
  readonly tone?: "default" | "inverse";
  readonly unit?: string;
  readonly value: string;
}

// The dashboard KPI: one figure, one label, at most one delta. The value
// arrives formatted; the tile never rounds. Exactly one tile per dashboard
// takes the inverse tone and carries the figure that matters most. The tone
// is a data attribute the stylesheet scopes tokens on, so every part inside,
// the delta included, recolours without being told. The figure steps down
// with the width of the card's header, which the registry makes a
// container, so a figure of ten characters, a balance in the millions,
// fits a tile two across a phone, down to a 320px one; every tile in a
// row is the same width, so the figures in it step together whatever
// each one's length. A tile its screen marks as hidden on a phone is
// left off below the breakpoint the tiles go two across at, so a phone
// opens on the two that matter most in one row rather than four in
// two, and on the rest of the screen sooner. An action the tile is
// given sits in its top corner, the label and the figure beside it.
// A tile waiting on what it will say can hold room for it: a delta to
// come is an ellipsis in the delta's place, seen but not read, and a
// caption it holds is kept unseen and unread beneath the one it shows,
// so the tile keeps that caption's lines at any width. Held, the
// caption takes a line of its own beneath any delta, so a delta of
// another width cannot move it, and the tile is the height it lands at
// before it lands.
export function StatTile({
  action,
  caption,
  delta,
  deltaFormat,
  holds,
  icon,
  isHiddenOnPhone = false,
  label,
  tone = "default",
  unit,
  value,
}: StatTileProps): JSX.Element {
  const Icon = icon;
  return (
    <Card
      className={cn(
        "gap-3 data-[tone=inverse]:ring-0",
        isHiddenOnPhone && "max-sm:hidden",
      )}
      data-tone={tone}
    >
      <CardHeader className="gap-1.5">
        <span className="flex items-center gap-1.5 label text-muted-foreground">
          {Icon !== undefined && <Icon aria-hidden className="size-3.5" />}
          {label}
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="figure text-base font-medium tracking-tight @[7.5rem]:text-xl @[8.75rem]:text-2xl @[11rem]:text-3xl">
            {value}
          </span>
          {unit !== undefined && (
            <span className="figure text-base text-muted-foreground">
              {unit}
            </span>
          )}
        </span>
        {action !== undefined && <CardAction>{action}</CardAction>}
      </CardHeader>
      {(delta !== undefined || caption !== undefined) && (
        <CardContent className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {delta === null ? (
            <span aria-hidden className="figure text-sm font-medium">
              …
            </span>
          ) : (
            delta !== undefined && (
              <DeltaValue format={deltaFormat} value={delta} />
            )
          )}
          {holds === undefined ? (
            caption
          ) : (
            <span className={cn("grid", delta !== undefined && "basis-full")}>
              <span className="col-start-1 row-start-1">{caption}</span>
              {holds !== caption && (
                <span aria-hidden className="invisible col-start-1 row-start-1">
                  {holds}
                </span>
              )}
            </span>
          )}
        </CardContent>
      )}
    </Card>
  );
}
