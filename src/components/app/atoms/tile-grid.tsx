import type { JSX, ReactNode } from "react";

interface TileGridProps {
  readonly children: ReactNode;
}

// The row of stat tiles a screen opens its body with: as many across as
// fit at the tile's least width, wrapping beneath when the screen is
// narrower, every tile the same width. Stated here once so the least
// width is one number rather than one per screen.
export function TileGrid({ children }: TileGridProps): JSX.Element {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
      {children}
    </div>
  );
}
