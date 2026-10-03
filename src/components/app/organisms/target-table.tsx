"use client";

import type { JSX } from "react";

import { cn } from "cn";
import { TriangleAlert } from "lucide-react";
import { useOptimistic } from "react";

import type { OptionGroup } from "@/components/app/atoms/cell-select";
import type { Asset, Cma, Mapping, Sleeve } from "@/data/cma";
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

// What the flag on a category nothing is assigned to says: that no fund
// is assigned to it in Portfolio Performance, in the words its owner
// assigns one in.
const unimplemented = "No fund assigned";

// The headings the select groups the classes under, by the sleeve they
// blend into, as BlackRock heads them.
const headings = { bonds: "Fixed income", stocks: "Equities" } as const;

// What the table heads each group of its rows: the sleeve the
// categories in it blend into, or, for those that blend into neither,
// that they are not blended.
const groupNames: Record<"none" | Sleeve, string> = {
  bonds: "Bonds",
  none: "Not blended",
  stocks: "Stocks",
};

// The categories of a target allocation, a row apiece, grouped by the
// sleeve each blends into, stocks then bonds, with those that blend
// into neither last, and in the order given within a group: each one's
// name, the class of the latest CMA it is mapped onto and that class's
// 20-year return, and its target, a share of the whole to the hundredth
// of a point. A target of nothing is muted, folded or not, since the row
// is there to be wound down rather than bought. Each group opens on a
// row of its own naming it, with the share of the whole it holds and the
// return its categories blend to by their targets, a weighted mean of
// the column it heads, so a class hedged to sterling counts at its hedged
// return, and the row says the hedging is included: it is the rates
// tab's blended return with its hedging added. A sleeve's return is
// shown only while every category asking for a share has a class the
// vintage prices, as the rates tab blends only then, and the row says
// why it is dashed otherwise; the group that is not blended has none,
// and says why, and one with nothing in it is left out. A category's
// group follows its class, so one mapped onto a class of the other
// sleeve moves to that sleeve's group as it is chosen.
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
// derived until it is. Where no fund is assigned to it, it is flagged
// muted: its target cannot be met until a holding is chosen for it,
// but it blends at its class's return all the same, so nothing waits on
// it, and it is not to read as the flag that does. One asking for
// nothing is flagged for the class muted, since it weighs nothing and
// keeps nothing from being derived, but would the day it is given a
// share; and not for having no fund, since it is there to be wound
// down. While the table is too narrow to read across, as on a phone, each row folds into
// one cell: the name and the target on its first line, then the
// flags, the class, and its return on a line of its own, so the class
// has the cell's whole width and its longest names show in full, and the
// header goes with the other columns; a group's row folds the same way,
// its return beneath its name and share. Nothing opens from a row.
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
          <TableHead>CMA class</TableHead>
          <TableHead className="text-right">20y return</TableHead>
          <TableHead className="text-right">Target</TableHead>
        </TableRow>
      </TableHeader>
      {groupsIn(categories, cma, shown).map(
        ({ detail, members, name, rate, share }) => (
          <TableBody key={name}>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <FoldedCell figure={formatPercent(share)} name={name}>
                <span>{rate === "—" ? detail : `${rate} · ${detail}`}</span>
              </FoldedCell>
              <TableHead
                className="label text-muted-foreground folded:hidden"
                scope="rowgroup"
              >
                {name}
              </TableHead>
              <TableCell className="text-muted-foreground folded:hidden">
                {detail}
              </TableCell>
              <TableCell className="text-right figure font-medium folded:hidden">
                {rate}
              </TableCell>
              <TableCell className="text-right figure font-medium folded:hidden">
                {formatPercent(share)}
              </TableCell>
            </TableRow>
            {members.map((category) => {
              const target = formatPercent(category.share);
              const mapped = mappedOf(category, cma, shown);
              const isAsked = category.share > 0;
              const flags = [
                ...(cma === null ? [] : unblended(cma, mapped)).map((text) => ({
                  isMuted: !isAsked,
                  text,
                })),
                ...(isAsked && !category.isImplemented
                  ? [{ isMuted: true, text: unimplemented }]
                  : []),
              ];
              const rate =
                mapped.kind === "priced"
                  ? formatCurveRate(mapped.asset.rate)
                  : "—";
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
                    {flags.map(({ isMuted, text }) => (
                      <span
                        className={cn(!isMuted && "text-caution")}
                        key={text}
                      >
                        {text}
                      </span>
                    ))}
                    <span className="pt-1">{choice}</span>
                    <span>
                      20y return <span className="figure">{rate}</span>
                    </span>
                  </FoldedCell>
                  <TableCell className="folded:hidden">
                    <span className="flex flex-wrap items-center gap-3">
                      {category.name}
                      {flags.map(({ isMuted, text }) => (
                        <Badge
                          className={cn(isMuted && "text-muted-foreground")}
                          key={text}
                          variant={isMuted ? "outline" : "caution"}
                        >
                          <TriangleAlert aria-hidden />
                          {text}
                        </Badge>
                      ))}
                    </span>
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
        ),
      )}
    </Table>
  );
}

// What a group's row says of its return: that a sleeve's is blended by
// the targets with its hedging included, or why it is not blended yet;
// and for the group not blended, why its categories are not.
function detailOf(
  group: "none" | Sleeve,
  cma: Cma | null,
  isBlended: boolean,
): string {
  if (group === "none") {
    return cma === null ? "No CMA pulled yet" : "No class the vintage prices";
  }
  return isBlended
    ? "Blended by target, hedging included"
    : "Not blended until every category asking for a share has a class";
}

// The categories in the groups the table lays them out in, each with
// its name, the share of the whole its categories hold, the return they
// blend to by their targets, or a dash where they blend to none, and
// what that return is or why there is none. A sleeve blends only while
// every category asking for a share has a class the vintage prices, as
// the rates are derived only then, and one asking for nothing blends to
// no return. A group with nothing in it is left out.
function groupsIn(
  categories: readonly Target[],
  cma: Cma | null,
  mappings: readonly Mapping[],
): readonly {
  readonly detail: string;
  readonly members: readonly Target[];
  readonly name: string;
  readonly rate: string;
  readonly share: number;
}[] {
  const priced = categories.map((category) => {
    const mapped = mappedOf(category, cma, mappings);
    return { asset: mapped.kind === "priced" ? mapped.asset : null, category };
  });
  const isBlended = priced.every(
    ({ asset, category }) => asset !== null || category.share === 0,
  );
  const bySleeve = Object.groupBy(
    priced,
    ({ asset }) => asset?.sleeve ?? "none",
  );
  return (["stocks", "bonds", "none"] as const).flatMap((group) => {
    const members = bySleeve[group] ?? [];
    const share = members.reduce(
      (sum, { category }) => sum + category.share,
      0,
    );
    const earned = members.reduce(
      (sum, { asset, category }) => sum + category.share * (asset?.rate ?? 0),
      0,
    );
    return members.length === 0
      ? []
      : [
          {
            detail: detailOf(group, cma, isBlended),
            members: members.map(({ category }) => category),
            name: groupNames[group],
            rate:
              group === "none" || !isBlended || share === 0
                ? "—"
                : formatCurveRate(earned / share),
            share,
          },
        ];
  });
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
