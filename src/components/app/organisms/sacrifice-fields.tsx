import type { JSX } from "react";

import type { Share } from "@/data/accounts";
import type { IncomeLine } from "@/data/income";

import { RateField } from "@/components/app/molecules/rate-field";
import { contributionOf } from "@/data/income";
import { yearly } from "@/lib/cadence";
import { formatGbp } from "@/lib/money";

interface SacrificeFieldsProps {
  readonly draft: readonly Share[];
  readonly feeders: readonly IncomeLine[];
  readonly initial: readonly Share[];
  readonly onAmend: (shares: readonly Share[]) => void;
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
  onAmend,
}: SacrificeFieldsProps): JSX.Element {
  function share(line: IncomeLine, sacrifice: number): void {
    onAmend(
      draft.map((held) =>
        held.line === line.id ? { line: held.line, sacrifice } : held,
      ),
    );
  }

  return (
    <>
      {feeders.map((line) => (
        <RateField
          defaultValue={shareOf(line, initial)}
          hint={landsOf(line, shareOf(line, draft))}
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

// What the share lands in the pension a year, with the employer's NI
// saved on it, as the accounts' table states it.
function landsOf(line: IncomeLine, sacrifice: number): string {
  const lands = yearly(contributionOf({ ...line, sacrifice }), line.cadence);
  return `Of its ${formatGbp(line.amount)} base; ${formatGbp(lands)} a year lands with the NI saved`;
}

// The share held for the line, and none for a line the shares leave
// out, which the dialog never hands the fields but the list allows.
function shareOf(line: IncomeLine, shares: readonly Share[]): number {
  return shares.find((share) => share.line === line.id)?.sacrifice ?? 0;
}
