"use client";

import type { JSX } from "react";

import { cn } from "cn";
import { TriangleAlert } from "lucide-react";
import { useOptimistic } from "react";

import type { OptionGroup } from "@/components/app/atoms/cell-select";
import type { Asset, Cma, Mapping } from "@/data/cma";
import type { Target } from "@/data/targets";

import { mapCategory } from "@/actions/targets";
import { CellSelect } from "@/components/app/atoms/cell-select";
import { FoldedCell } from "@/components/app/molecules/folded-cell";
import { Badge } from "@/components/kit/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/kit/table";
import { vintageName } from "@/data/cma";
import { useSender } from "@/hooks/use-sender";
import { formatCurveRate, formatPercent } from "@/lib/money";

// What a category's class reads as: the class it is mapped onto as the
// latest vintage prices it, or its name alone where the vintage prices
// no class of that name, or nothing where it is mapped onto none.
type Mapped =
  | { readonly asset: Asset; readonly kind: "priced" }
  | { readonly kind: "none" }
  | { readonly kind: "unpriced"; readonly name: string };

// A category mapped onto a class by its name, or onto none.
interface Remapping {
  readonly asset: null | string;
  readonly category: string;
}

interface TargetTableProps {
  readonly categories: readonly Target[];
  readonly cma: Cma | null;
  readonly mappings: readonly Mapping[];
}

// What the flag on a category nothing is assigned to says.
const unimplemented = "Nothing implements it";

// The headings the select groups the classes under, by the sleeve they
// blend into, as BlackRock heads them.
const headings = { bonds: "Fixed income", stocks: "Equities" } as const;

// The categories of a target allocation, a row apiece in the order
// given: each one's name, the Portfolio Performance classes it sits
// beneath, read from the top down, the class of the latest CMA it is
// mapped onto and that class's 20-year return, and its target, a share
// of the whole to the hundredth of a point. A category beneath no class
// but the root has a dash for its classes. A target of nothing is
// muted, folded or not, since the row is there to be wound down rather
// than bought.
//
// The class is chosen in the row, from the classes the latest vintage
// prices under their sleeves' headings, or none, and saved as it is
// chosen: the row shows it, and its return, at once, while the store is
// asked, and the store's answer draws the screen again from the mappings
// kept, under a toast, or puts the class back and says why under a
// toast. A category mapped onto a class the vintage no longer prices
// keeps it, offered on its own under a heading saying so, with no
// return. Before a CMA is pulled there is nothing to choose from, and
// the class and the return are dashed.
//
// A category that asks for something is flagged beside its name in the
// caution tone where the CMA cannot blend it, mapped onto no class or
// onto one the vintage no longer prices, since the rates cannot be
// derived until it is, and where nothing is assigned to it, since the
// target cannot be met until a holding is chosen for it. One asking for
// nothing is flagged for the class muted, since it weighs nothing and
// keeps nothing from being derived, but would the day it is given a
// share; and not for nothing implementing it, since it is there to be
// wound down. While the
// table is too narrow to read across, as on a phone, each row folds into
// one cell: the name and the target on its first line, then the
// classes, the flags and the class with its return beneath, and the
// header goes with the other columns. Nothing opens from a row.
export function TargetTable({
  categories,
  cma,
  mappings,
}: TargetTableProps): JSX.Element {
  const [shown, show] = useOptimistic(
    mappings,
    (current: readonly Mapping[], next: Remapping) => [
      ...current.filter(({ category }) => category !== next.category),
      ...(next.asset === null ? [] : [{ ...next, asset: next.asset }]),
    ],
  );
  const { send } = useSender();

  function map(category: Target, asset: null | string): void {
    send(
      async () => {
        show({ asset, category: category.id });
        return mapCategory({ asset, category: category.id });
      },
      {
        failure: "CMA class not saved",
        success: () => ({
          description: `${category.name} onto ${asset ?? "no class"}`,
          title: "CMA class saved",
        }),
      },
    );
  }

  return (
    <Table>
      <TableHeader className="folded:hidden">
        <TableRow>
          <TableHead>Category</TableHead>
          <TableHead>PP class</TableHead>
          <TableHead>CMA class</TableHead>
          <TableHead className="text-right">20y return</TableHead>
          <TableHead className="text-right">Target</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {categories.map((category) => {
          const classes = classesOf(category);
          const target = formatPercent(category.share);
          const mapped = mappedOf(category, cma, shown);
          const isAsked = category.share > 0;
          const flags = [
            ...(cma === null ? [] : unblended(cma, mapped)).map((text) => ({
              isMuted: !isAsked,
              text,
            })),
            ...(isAsked && !category.isImplemented
              ? [{ isMuted: false, text: unimplemented }]
              : []),
          ];
          const rate =
            mapped.kind === "priced" ? formatCurveRate(mapped.asset.rate) : "—";
          const choice =
            cma === null ? (
              "—"
            ) : (
              <CellSelect
                groups={groupsOf(cma, mapped)}
                label={`CMA class for ${category.name}`}
                none="No class"
                onValueChange={(asset) => {
                  map(category, asset);
                }}
                value={valueOf(mapped)}
              />
            );
          return (
            <TableRow key={category.id}>
              <FoldedCell
                figure={target}
                isFigureMuted={category.share === 0}
                name={category.name}
              >
                <span>{classes}</span>
                {flags.map(({ isMuted, text }) => (
                  <span className={cn(!isMuted && "text-caution")} key={text}>
                    {text}
                  </span>
                ))}
                <span className="flex items-center gap-3 pt-1">
                  {choice}
                  <span className="w-14 shrink-0 text-right figure">
                    {rate}
                  </span>
                </span>
              </FoldedCell>
              <TableCell className="folded:hidden">
                <span className="flex flex-wrap items-center gap-3">
                  {category.name}
                  {flags.map(({ isMuted, text }) => (
                    <Badge
                      className={cn(
                        "label",
                        isMuted && "text-muted-foreground",
                      )}
                      key={text}
                      variant={isMuted ? "outline" : "caution"}
                    >
                      <TriangleAlert aria-hidden />
                      {text}
                    </Badge>
                  ))}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground folded:hidden">
                {classes}
              </TableCell>
              <TableCell className="folded:hidden">{choice}</TableCell>
              <TableCell
                className={cn(
                  "text-right figure folded:hidden",
                  mapped.kind !== "priced" && "text-muted-foreground",
                )}
              >
                {rate}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right figure folded:hidden",
                  category.share === 0 && "text-muted-foreground",
                )}
              >
                {target}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// The classes a category sits beneath, from the top down, or a dash for
// one beneath none.
function classesOf({ classes }: Target): string {
  return classes.length === 0 ? "—" : classes.join(" · ");
}

// The classes a category can be mapped onto, under their sleeves'
// headings, each carried into sterling from another currency saying
// which, and the class it is mapped onto under a heading of its own
// where the vintage no longer prices it.
function groupsOf(cma: Cma, mapped: Mapped): readonly OptionGroup[] {
  const sleeve = (key: keyof typeof headings): OptionGroup => ({
    label: headings[key],
    options: cma.assets
      .filter((asset) => asset.sleeve === key)
      .map(({ carriedFrom, name }) => ({
        label:
          carriedFrom === undefined ? name : `${name} (from ${carriedFrom})`,
        value: name,
      })),
  });
  return [
    ...(mapped.kind === "unpriced"
      ? [
          {
            label: `Not in the ${vintageName(cma)} CMA`,
            options: [{ label: mapped.name, value: mapped.name }],
          },
        ]
      : []),
    sleeve("stocks"),
    sleeve("bonds"),
  ];
}

// The class a category is mapped onto, as the latest vintage prices it.
function mappedOf(
  category: Target,
  cma: Cma | null,
  mappings: readonly Mapping[],
): Mapped {
  const name = mappings.find(
    (mapping) => mapping.category === category.id,
  )?.asset;
  if (name === undefined) {
    return { kind: "none" };
  }
  const asset = cma?.assets.find((priced) => priced.name === name);
  return asset === undefined
    ? { kind: "unpriced", name }
    : { asset, kind: "priced" };
}

// What the flag on a category the CMA cannot blend says: that it has no
// class, or that the vintage does not price the one it has; or nothing,
// for one it can.
function unblended(cma: Cma, mapped: Mapped): readonly string[] {
  switch (mapped.kind) {
    case "none":
      return ["No CMA class"];
    case "priced":
      return [];
    case "unpriced":
      return [`Not in the ${vintageName(cma)} CMA`];
  }
}

// The class a category's select shows, by its name, or none.
function valueOf(mapped: Mapped): null | string {
  switch (mapped.kind) {
    case "none":
      return null;
    case "priced":
      return mapped.asset.name;
    case "unpriced":
      return mapped.name;
  }
}
