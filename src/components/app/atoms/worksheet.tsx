import type { JSX } from "react";

import { cn } from "cn";
import { Fragment, useId } from "react";

// A row of a worksheet: its name, what its figures rest on where that
// needs saying, a figure a column, and whether it is a result rather
// than a step towards one.
export interface WorksheetRow {
  readonly detail?: string | undefined;
  readonly figures: readonly string[];
  readonly isResult?: boolean;
  readonly label: string;
}

interface WorksheetProps {
  readonly columns: readonly string[];
  readonly label: string;
  readonly rows: readonly WorksheetRow[];
}

// Figures worked out down and across at once: a column for each thing
// worked out, headed by its name, and a row for each step, its name and
// each figure under its column in the mono face, with what its figures
// rest on, where a row says, in a line beneath that runs the table's
// width. A result sits
// under a heavier rule, its name set as a label and its figures large,
// so the eye finds what the steps come to before reading them. It is a
// table named as given, so a screen reader can read a figure with its
// row and its column, and the line beneath describes the row's name
// rather than reading as a row of its own. The figures shrink with the
// space the table is given rather than the screen, and the line beneath
// runs under the figures as well as the name, so on a phone the names
// keep the room the figures leave them and the line wraps once rather
// than down a narrow column.
export function Worksheet({
  columns,
  label,
  rows,
}: WorksheetProps): JSX.Element {
  const id = useId();
  return (
    <div className="@container">
      <table aria-label={label} className="w-full border-collapse">
        <thead>
          <tr>
            <td />
            {columns.map((column) => (
              <th
                className="w-px pb-3 pl-3 text-right label font-normal text-muted-foreground @lg:pl-8"
                key={column}
                scope="col"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(
            ({ detail, figures, isResult = false, label: name }, row) => {
              const pad = detail === undefined ? "pb-3" : "pb-1";
              return (
                <Fragment key={name}>
                  <tr
                    className={cn(
                      "border-t",
                      isResult && "border-foreground/30",
                    )}
                  >
                    <th
                      aria-describedby={
                        detail === undefined
                          ? undefined
                          : `${id}-${String(row)}`
                      }
                      className={cn(
                        "pt-3 text-left align-baseline font-normal",
                        pad,
                        isResult && "label text-muted-foreground",
                      )}
                      scope="row"
                    >
                      {name}
                    </th>
                    {figures.map((figure, column) => (
                      <td
                        className={cn(
                          "pt-3 pl-3 text-right align-baseline figure @lg:pl-8",
                          pad,
                          isResult
                            ? "text-lg font-medium @lg:text-2xl"
                            : "text-sm @lg:text-base",
                        )}
                        key={columns[column]}
                      >
                        {figure}
                      </td>
                    ))}
                  </tr>
                  {detail !== undefined && (
                    <tr aria-hidden>
                      <td
                        className="pb-3 text-sm text-muted-foreground"
                        colSpan={columns.length + 1}
                        id={`${id}-${String(row)}`}
                      >
                        {detail}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            },
          )}
        </tbody>
      </table>
    </div>
  );
}
