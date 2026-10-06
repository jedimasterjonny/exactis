import type { JSX } from "react";

import { cn } from "cn";

interface YearAgeProps {
  readonly age: string;
  readonly className?: string;
  readonly year: number | string;
}

// When a row falls: its year, or its span of years, in figures, with the
// age reached in it beneath as a faint micro-label, so the year leads and
// the age is there to be read across. Set to the right, as the column
// before a row's chevron is. The class is the caller's, for where its row
// places the pair and whether it folds away at a narrow width.
export function YearAge({ age, className, year }: YearAgeProps): JSX.Element {
  return (
    <span className={cn("grid gap-0.5 text-right", className)}>
      <span className="figure">{year}</span>
      <span className="label text-muted-foreground/60">{age}</span>
    </span>
  );
}
