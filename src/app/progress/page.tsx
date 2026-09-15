import type { JSX } from "react";

import { Info, Plus } from "lucide-react";

import { ScreenHeader } from "@/components/screen-header";
import { StatTile } from "@/components/stat-tile";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { points } from "@/data/points";

// The four figure columns, right-aligned mono per the ledger rules. The
// date column is the row's name and stays in the body face.
const figureColumns = [
  ["Tax-deferred", "deferred"],
  ["Tax-free", "free"],
  ["Total assets", "assets"],
  ["Asset loans", "loans"],
] as const;

// Every figure below is the reference kit's invented plan, standing in until
// there is a projection engine to read from.
export default function Progress(): JSX.Element {
  return (
    <main>
      <ScreenHeader
        // Adding a point needs the edit dialog, which the button waits for.
        actions={
          <Button size="sm">
            <Plus aria-hidden />
            Add point
          </Button>
        }
        label="Sect. IV · Progress"
        title="Progress points"
      >
        Newest first
      </ScreenHeader>
      <div className="grid gap-5 p-8">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
          <StatTile
            caption="Monthly since Jan 2025"
            label="Points recorded"
            value="84"
          />
          <StatTile
            caption="Recorded 11 days ago"
            label="Latest point"
            unit="2026"
            value="31 Aug"
          />
          <StatTile
            caption="Net worth, today's money"
            label="Tracked 12 months"
            value="+£62,404"
          />
          <StatTile
            caption="vs last month"
            delta={4820}
            label="Net worth today"
            value="£533,671"
          />
        </div>
        <Card className="py-0">
          <Table className="[&_td]:px-4 [&_th]:px-4">
            <TableHeader>
              <TableRow>
                <TableHead>Point</TableHead>
                {figureColumns.map(([header]) => (
                  <TableHead className="text-right" key={header}>
                    {header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {points.map((point) => (
                <TableRow key={point.date}>
                  <TableCell>{point.date}</TableCell>
                  {figureColumns.map(([header, key]) => (
                    <TableCell className="text-right figure" key={header}>
                      {point[key]}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          Net worth, assets and liabilities are derived from the values you
          record here.
        </p>
      </div>
    </main>
  );
}
