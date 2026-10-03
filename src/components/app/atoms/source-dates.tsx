import type { JSX } from "react";

import type { Deductions, Vintages } from "@/data/cma";
import type { Curve } from "@/data/inflation";
import type { Targets } from "@/data/targets";

import { vintageMonth } from "@/data/cma";
import { daysBetween, formatDay } from "@/lib/months";

interface SourceDatesProps {
  readonly cma: null | Vintages;
  readonly curve: Curve | null;
  readonly deductions: Deductions;
  readonly targets: null | Targets;
  readonly today: string;
}

// The four things the rates rest on, in one strip, each with the day it
// was brought in on and how old that is: BlackRock's vintage and the day
// its data are as of, the Bank's curve, the target allocation imported,
// and the fees and yield, the only two nothing pulled moves. A source
// not brought in yet says so, and so do fees and yield kept before the
// day was. The strip says how old each is rather than judging whether
// that is too old, since each comes on its own cadence and the reader
// knows it. The day it is is given rather than read, so the strip draws
// the same on the server as in a test.
export function SourceDates({
  cma,
  curve,
  deductions,
  targets,
  today,
}: SourceDatesProps): JSX.Element {
  const dated = (day: string): string =>
    `${formatDay(day)} · ${ageOf(daysBetween(day, today))}`;
  const sources = [
    {
      name: "BlackRock CMA",
      value:
        cma === null
          ? "Not pulled yet"
          : `${vintageMonth(cma.latest)}, data ${dated(cma.latest.asOf)}`,
    },
    {
      name: "BoE curve",
      value: curve === null ? "Not pulled yet" : dated(curve.asOf),
    },
    {
      name: "Target allocation",
      value:
        targets === null
          ? "Not imported yet"
          : `Imported ${dated(targets.importedOn)}`,
    },
    {
      name: "Fees and yield",
      value:
        deductions.setOn === undefined
          ? "Not dated"
          : `Set ${dated(deductions.setOn)}`,
    },
  ];
  return (
    <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
      {sources.map(({ name, value }) => (
        <div className="grid gap-1" key={name}>
          <dt className="label text-muted-foreground">{name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// How old a source brought in so many days ago is, in words.
function ageOf(days: number): string {
  if (days === 0) {
    return "today";
  }
  return `${String(days)} ${days === 1 ? "day" : "days"} old`;
}
