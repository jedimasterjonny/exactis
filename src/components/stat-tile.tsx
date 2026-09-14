import type { LucideIcon } from "lucide-react";
import type { JSX } from "react";

import type { DeltaFormat } from "@/components/delta-value";

import { DeltaValue } from "@/components/delta-value";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

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
// the delta included, recolours without being told.
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
          <span className="figure text-3xl font-medium tracking-tight">
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
