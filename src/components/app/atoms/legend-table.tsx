import type { JSX } from "react";

import { cn } from "cn";

// A row of the legend: a part named, in the tone a bar beside it draws
// it in, with a muted note on what bounds it or what it stands at, and
// the figure it comes to.
export interface LegendEntry {
  readonly figure: string;
  readonly key: string;
  readonly name: string;
  readonly note?: string;
  readonly tone: string;
}

interface LegendTableProps {
  readonly caption: string;
  readonly entries: readonly LegendEntry[];
}

// Where a bar's tones are named: a captioned table, a row a part, each
// a swatch in its tone, its name and note, and its figure to the right.
export function LegendTable({
  caption,
  entries,
}: LegendTableProps): JSX.Element {
  return (
    <table className="w-full text-sm">
      <caption className="pb-1.5 text-left label text-muted-foreground">
        {caption}
      </caption>
      <tbody>
        {entries.map(({ figure, key, name, note, tone }) => (
          <tr className="border-t first:border-t-0" key={key}>
            <td className="w-5 py-1.5">
              <span
                aria-hidden
                className={cn("block size-3 rounded-sm", tone)}
                data-slot="legend-swatch"
              />
            </td>
            <td className="py-1.5">
              {name}
              {note !== undefined && (
                <>
                  {" "}
                  <span className="ml-1 figure text-xs text-muted-foreground">
                    {note}
                  </span>
                </>
              )}
            </td>
            <td className="py-1.5 text-right figure">{figure}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
