import type { LucideIcon } from "lucide-react";
import type { JSX } from "react";

import type { DeltaFormat } from "@/components/app/atoms/delta-value";

import { DeltaValue } from "@/components/app/atoms/delta-value";
import { Card, CardContent, CardHeader } from "@/components/kit/card";

interface StatTileProps {
  readonly caption?: string;
  readonly delta?: number;
  readonly deltaFormat?: DeltaFormat;
  readonly icon?: LucideIcon;
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
// each one's length.
export function StatTile({
  caption,
  delta,
  deltaFormat,
  icon,
  label,
  tone = "default",
  unit,
  value,
}: StatTileProps): JSX.Element {
  const Icon = icon;
  return (
    <Card className="gap-3 data-[tone=inverse]:ring-0" data-tone={tone}>
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
      </CardHeader>
      {(delta !== undefined || caption !== undefined) && (
        <CardContent className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {delta !== undefined && (
            <DeltaValue format={deltaFormat} value={delta} />
          )}
          {caption}
        </CardContent>
      )}
    </Card>
  );
}
