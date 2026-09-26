import type { JSX, ReactNode } from "react";

interface TileGridProps {
  readonly children: ReactNode;
}

// The row of stat tiles a screen opens its body with: as many across as
// fit at the tile's least width, wrapping beneath when the screen is
// narrower, every tile the same width. Stated here once so the least
// width is one number rather than one per screen. On a phone the tiles
// are two across whatever that width says, since one across stacked
// every screen's four down the whole of its first view before any of
// what they sum was in sight; the tile sizes its figure to fit.
export function TileGrid({ children }: TileGridProps): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fit,minmax(210px,1fr))]">
      {children}
    </div>
  );
}
