import type { JSX } from "react";

import { cn } from "cn";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export type DeltaFormat = "currency" | "percent" | "plain" | "points";

interface DeltaValueProps {
  readonly format?: DeltaFormat | undefined;
  readonly value: number;
}

type Direction = "down" | "flat" | "up";

// exceptZero signs only what is non-zero after rounding, so a delta that
// rounds away is flat rather than a signed zero, and NaN is flat too. Money
// is never abbreviated and never carries pence in a delta.
const formatters: Record<DeltaFormat, Intl.NumberFormat> = {
  currency: new Intl.NumberFormat("en-GB", {
    currency: "GBP",
    maximumFractionDigits: 0,
    signDisplay: "exceptZero",
    style: "currency",
  }),
  percent: new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    signDisplay: "exceptZero",
  }),
  plain: new Intl.NumberFormat("en-GB", { signDisplay: "exceptZero" }),
  points: new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    signDisplay: "exceptZero",
  }),
};

// A percentage-point difference is written pp, never %.
const suffixes: Record<DeltaFormat, string> = {
  currency: "",
  percent: "%",
  plain: "",
  points: "pp",
};

const toneClasses: Record<Direction, string> = {
  down: "text-destructive",
  flat: "text-muted-foreground",
  up: "text-positive",
};

// A signed change in mono figures. The sign is a real minus, U+2212, never a
// hyphen; a zero delta is a flat dash with no sign, colour or arrow. Used
// dozens of times per screen, so sign, colour and glyph are decided here once.
export function DeltaValue({
  format = "currency",
  value,
}: DeltaValueProps): JSX.Element {
  const text = formatters[format].format(value);
  const direction = directionOf(text);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 figure text-sm font-medium",
        toneClasses[direction],
      )}
    >
      {direction === "up" && <ArrowUpRight aria-hidden className="size-3.5" />}
      {direction === "down" && (
        <ArrowDownRight aria-hidden className="size-3.5" />
      )}
      {content(direction, text, suffixes[format])}
    </span>
  );
}

function content(direction: Direction, text: string, suffix: string): string {
  switch (direction) {
    case "down":
      // Intl's hyphen-minus is replaced with the real minus.
      return `−${text.slice(1)}${suffix}`;
    case "flat":
      return "—";
    case "up":
      return `${text}${suffix}`;
  }
}

function directionOf(text: string): Direction {
  if (text.startsWith("+")) {
    return "up";
  }
  if (text.startsWith("-")) {
    return "down";
  }
  return "flat";
}
