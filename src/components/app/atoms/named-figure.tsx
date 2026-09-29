import type { JSX } from "react";

interface NamedFigureProps {
  readonly children: string;
  readonly name: string;
}

// A figure a region comes to, under its name: the name as a micro-label
// and the figure beneath it, large in the mono face. The two are a term
// and its definition, so the caller sets it in a description list,
// beside any others the region comes to.
export function NamedFigure({ children, name }: NamedFigureProps): JSX.Element {
  return (
    <div className="grid gap-1">
      <dt className="label text-muted-foreground">{name}</dt>
      <dd className="figure text-3xl font-medium">{children}</dd>
    </div>
  );
}
