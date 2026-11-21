import type { JSX } from "react";

import type { Share } from "@/data/accounts";
import type { IncomeLine } from "@/data/income";
import type { Month } from "@/data/schedule";

import { RateField } from "@/components/app/molecules/figure-field";
import { contributionOf, sacrificeOf } from "@/data/income";
import { yearly } from "@/lib/cadence";
import { runsIn } from "@/lib/lines";
import { formatGbp } from "@/lib/money";
import { sacrificeCapIn } from "@/lib/tax";

interface SacrificeFieldsProps {
  readonly draft: readonly Share[];
  readonly feeders: readonly IncomeLine[];
  readonly initial: readonly Share[];
  readonly lines?: readonly IncomeLine[];
  readonly onAmend: (shares: readonly Share[]) => void;
  readonly opens: Month;
}

// The fields a pension's dialog adds to the account's own for the
// salaries feeding it: each salary's share of its base sacrificed into
// the pension, as the salary's own dialog takes it, so the share is
// edited from either side, with what the share lands a year beneath,
// moving as it is typed. They are cells rather than a row, so they
// fill the account fields' slot and flow in its grid, one feeder
// beside the growth and a second on the row after. The fields are
// uncontrolled and mount with the shares as the account opened, and
// report the shares whole to the dialog, whose draft mirrors them,
// since a share is one of a list rather than a field of the draft.
// What else a salary carries stays its own dialog's.
export function SacrificeFields({
  draft,
  feeders,
  initial,
  lines = feeders,
  onAmend,
  opens,
}: SacrificeFieldsProps): JSX.Element {
  function share(line: IncomeLine, sacrifice: number): void {
    onAmend(
      draft.map((held) =>
        held.line === line.id ? { line: held.line, sacrifice } : held,
      ),
    );
  }

  const current = new Set(feeders);

  return (
    <>
      {feeders.map((line) => (
        <RateField
          defaultValue={shareOf(line, initial)}
          hint={landsOf(line, {
            current,
            draft,
            earlier: lines
              .slice(0, lines.indexOf(line))
              .filter(
                (other) => other.feeds !== null && other.owner === line.owner,
              ),
            opens,
          })}
          key={line.id}
          label={`Sacrificed from ${line.name}`}
          max={1}
          min={0}
          onValueCommitted={(sacrifice) => {
            share(line, sacrifice);
          }}
        />
      ))}
    </>
  );
}

// What the share lands in the pension a year when the salary starts (or
// as the plan opens if it is already running), with the employer's NI
// saved on the slice within the owner's remaining NI-exempt cap after
// earlier feeders of the same owner running in that month across any
// pension, and the employer's match where the salary is matched.
function landsOf(
  line: IncomeLine,
  {
    current,
    draft,
    earlier,
    opens,
  }: {
    readonly current: ReadonlySet<IncomeLine>;
    readonly draft: readonly Share[];
    readonly earlier: readonly IncomeLine[];
    readonly opens: Month;
  },
): string {
  const at =
    line.firstYear > opens.year ? { month: 0, year: line.firstYear } : opens;
  const cap = sacrificeCapIn(at);
  const used = earlier
    .filter((other) => runsIn(other, at))
    .reduce(
      (sum, other) =>
        sum +
        yearly(
          sacrificeOf({
            ...other,
            sacrifice: current.has(other)
              ? shareOf(other, draft)
              : other.sacrifice,
          }),
          other.cadence,
        ),
      0,
    );
  const room = Math.max(0, cap - used);
  const exempt = line.cadence === "month" ? room / 12 : room;
  const lands = yearly(
    contributionOf({ ...line, sacrifice: shareOf(line, draft) }, exempt),
    line.cadence,
  );
  return `Of its ${formatGbp(line.amount)} base, landing as ${formatGbp(lands)} a year`;
}

// The share held for the line, and none for a line the shares leave
// out, which the dialog never hands the fields but the list allows.
function shareOf(line: IncomeLine, shares: readonly Share[]): number {
  return shares.find((share) => share.line === line.id)?.sacrifice ?? 0;
}
