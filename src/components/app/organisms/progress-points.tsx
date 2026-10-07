import type { JSX } from "react";

import { History } from "lucide-react";

import type { ProgressPoint } from "@/data/progress";

import { EmptyState } from "@/components/app/atoms/empty-state";
import { Card } from "@/components/kit/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/kit/table";
import { formatGbp } from "@/lib/money";
import { formatMonthShort } from "@/lib/months";

type Balance = Exclude<keyof ProgressPoint, "month">;

interface ProgressPointsProps {
  readonly points: readonly ProgressPoint[];
}

// The five balances, in table order. One list drives the head and the
// body, so a column cannot be mono in the head and not the body.
const balances: readonly (readonly [string, Balance])[] = [
  ["Tax-deferred", "deferred"],
  ["Tax-free", "free"],
  ["Total assets", "assets"],
  ["Asset loans", "loans"],
  ["Unsecured debt", "unsecured"],
];

// The progress table: a row a point, newest first, each balance as it
// was read and a debt below nothing as an account's is. The points are
// read off the store as they are kept, and a household keeping none yet
// draws what would fill the table rather than a head over no rows.
export function ProgressPoints({ points }: ProgressPointsProps): JSX.Element {
  if (points.length === 0) {
    return (
      <EmptyState
        description="A point is the balances as the Household Finances sheet sums them at the end of a month, loaded into the store."
        icon={History}
        title="No points yet"
      />
    );
  }
  return (
    <Card className="py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Point</TableHead>
            {balances.map(([header]) => (
              <TableHead className="text-right" key={header}>
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {points.toReversed().map((point) => (
            <TableRow key={formatMonthShort(point.month)}>
              <TableCell>{formatMonthShort(point.month)}</TableCell>
              {balances.map(([header, key]) => (
                <TableCell className="text-right figure" key={header}>
                  {formatGbp(point[key])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
