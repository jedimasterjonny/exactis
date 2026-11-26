"use client";

import type { JSX } from "react";

import { cn } from "cn";
import { ChartPie, ChevronDown, Crosshair, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import type { Cma, Mapping } from "@/data/cma";
import type { Fund } from "@/data/lifestrategy";
import type { Allocation } from "@/data/rates";
import type { Targets } from "@/data/targets";

import { retargetFromLifeStrategy } from "@/actions/lifestrategy";
import { mapByName } from "@/actions/targets";
import { PortfolioSync } from "@/components/app/atoms/portfolio-sync";
import { Caution } from "@/components/app/molecules/caution";
import { EmptyState } from "@/components/app/molecules/empty-state";
import { SectionCard } from "@/components/app/organisms/section-card";
import { TargetTable } from "@/components/app/organisms/target-table";
import { Button, buttonVariants } from "@/components/kit/button";
import { CardContent, CardFooter } from "@/components/kit/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/kit/dropdown-menu";
import { suggestedMappings } from "@/data/class-table";
import { range, splitFor } from "@/data/lifestrategy";
import { withSyncNote } from "@/data/portfolio";
import { useSender } from "@/hooks/use-sender";
import { formatWholePercent } from "@/lib/money";
import { formatDay } from "@/lib/months";
import { assumptions, portfolio, subsectionLabel } from "@/lib/nav";

// How the household's owned .portfolio file stands beside the open
// branch's target allocation: none uploaded yet, present but refused to
// read, synced to the same categories and portfolios, intentionally
// retargeted in a scenario (same bookkeeping, different shares), or
// holding unsynced changes (with an optional live-CMA blocker).
export type PortfolioTargetStatus =
  | {
      readonly blockedReason?: string;
      readonly fileName: string;
      readonly kind: "unsynced";
      readonly version: number;
    }
  | {
      readonly fileName: string;
      readonly kind: "refused";
      readonly reason: string;
    }
  | {
      readonly fileName: string;
      readonly kind: "retargeted";
      readonly version: number;
    }
  | {
      readonly fileName: string;
      readonly kind: "synced";
      readonly version: number;
    }
  | { readonly kind: "missing" };

interface TargetAllocationProps {
  readonly branch: null | string;
  readonly cma: Cma | null;
  readonly mappings: readonly Mapping[];
  readonly portfolioStatus: PortfolioTargetStatus;
  readonly split: Allocation | null;
  readonly targets: null | Targets;
}

// The assumptions screen's target allocation: the categories Portfolio
// Performance's Asset Allocation taxonomy holds, the share of the whole
// it sets each, and the class of the latest CMA each is mapped onto,
// which the rates derived from the CMA are blended from. The allocation
// feeds from the household's owned .portfolio file on Portfolio; when
// that file is missing, unreadable, or holds unsynced changes, a caution
// above the card and an on-demand sync button surface the state cleanly.
//
// The header also retargets the allocation from a LifeStrategy fund
// chosen from a menu: on the household branch the server rewrites the
// owned .portfolio file's Asset Allocation weights in place and
// auto-syncs household.targets; inside a scenario it updates only the
// scenario's target shares until the scenario is made the household.
//
// While a category the CMA cannot blend has a class its name suggests,
// the header offers to map every such category by name, saying how many
// it would map. A class chosen by hand is never written over, and the
// table shows each class mapped, so what was suggested can be checked
// and changed.
export function TargetAllocation({
  branch,
  cma,
  mappings,
  portfolioStatus,
  split,
  targets,
}: TargetAllocationProps): JSX.Element {
  const isInScenario = branch !== null;
  const cautionId = useId();
  const emptyStateId = useId();
  const footerId = useId();
  const { isSending: isMapping, send: sendMapping } = useSender();
  const { isSending: isRetargeting, send: sendRetarget } = useSender();
  const suggested =
    cma === null || targets === null
      ? 0
      : suggestedMappings(cma, targets, mappings).length;
  const caution = cautionOf({
    cautionId,
    isInScenario,
    portfolioStatus,
    targets,
  });
  const isRetargetDisabled = isInScenario
    ? targets === null
    : portfolioStatus.kind === "missing" || portfolioStatus.kind === "refused";
  const fallbackNoteId = targets === null ? emptyStateId : footerId;
  const retargetNoteId = caution === null ? fallbackNoteId : cautionId;
  const version =
    portfolioStatus.kind === "missing" || portfolioStatus.kind === "refused"
      ? undefined
      : portfolioStatus.version;

  function mapNames(): void {
    sendMapping(mapByName, {
      failure: "Classes not mapped",
      success: (mapped) => ({
        description: `${String(mapped.length)} ${mapped.length === 1 ? "category" : "categories"} mapped`,
        title: "Classes mapped by name",
      }),
    });
  }

  function retarget(fund: Fund): void {
    const flag = flagOf(fund, split);
    sendRetarget(
      async () =>
        retargetFromLifeStrategy(fund.portId, {
          ...(version !== undefined &&
            !isInScenario && { afterVersion: version }),
          on: branch,
        }),
      {
        failure: "Allocation not retargeted",
        success: (result) => ({
          description: withSyncNote(
            [
              `${fund.name} as at ${formatDay(result.asOf)}, at ${splitSaid(result.split)}`,
              ...(result.isScenarioOnly ? ["In this scenario only"] : []),
              ...(flag === undefined ? [] : [flag]),
            ].join(". "),
            result.syncWarning,
          ),
          title: "Target allocation retargeted",
        }),
      },
    );
  }

  return (
    <>
      {caution}
      <SectionCard
        actions={
          <>
            {suggested > 0 && (
              <Button
                isBusy={isMapping}
                onClick={mapNames}
                size="sm"
                variant="outline"
              >
                <WandSparkles aria-hidden />
                {`Map ${String(suggested)} by name`}
              </Button>
            )}
            {portfolioStatus.kind === "unsynced" && targets !== null && (
              <PortfolioSync
                branch={branch}
                describedBy={cautionId}
                isDisabled={portfolioStatus.blockedReason !== undefined}
              />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={isRetargetDisabled}
                render={
                  <Button
                    aria-describedby={
                      isRetargetDisabled ? retargetNoteId : undefined
                    }
                    disabled={isRetargetDisabled}
                    isBusy={isRetargeting}
                    size="sm"
                    variant="outline"
                  />
                }
              >
                <Crosshair aria-hidden />
                Retarget from LifeStrategy
                <ChevronDown aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto max-w-80">
                {range.map((fund) => {
                  const flag = flagOf(fund, split);
                  return (
                    <DropdownMenuItem
                      className="flex-col items-start gap-0.5"
                      key={fund.portId}
                      onClick={() => {
                        retarget(fund);
                      }}
                    >
                      {fund.name}
                      <span
                        className={cn(
                          "text-xs",
                          flag === undefined
                            ? "text-muted-foreground"
                            : "text-caution",
                        )}
                      >
                        {flag ?? `At ${splitSaid(splitFor(fund, split))}`}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
        label={subsectionLabel(assumptions, 3)}
        title="Target allocation"
      >
        {targets === null ? (
          <CardContent>
            {emptyStateOf(portfolioStatus, branch, emptyStateId)}
          </CardContent>
        ) : (
          <TargetTable
            categories={targets.categories}
            cma={cma}
            mappings={mappings}
          />
        )}
        <CardFooter className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <p className="min-w-0 wrap-anywhere" id={footerId}>
            {footerCopyOf(portfolioStatus, isInScenario)}
          </p>
          <Link
            className={buttonVariants({ size: "sm", variant: "outline" })}
            href={portfolio.href}
          >
            {portfolioStatus.kind === "missing"
              ? "Upload on Portfolio"
              : "Open Portfolio"}
          </Link>
        </CardFooter>
      </SectionCard>
    </>
  );
}

// Caution banner placed above the card whenever the owned portfolio
// file is unreadable, missing for a legacy household with saved
// targets, or holding unsynced changes beside existing targets.
function cautionOf({
  cautionId,
  isInScenario,
  portfolioStatus,
  targets,
}: {
  readonly cautionId: string;
  readonly isInScenario: boolean;
  readonly portfolioStatus: PortfolioTargetStatus;
  readonly targets: null | Targets;
}): JSX.Element | null {
  switch (portfolioStatus.kind) {
    case "missing":
      return !isInScenario && targets !== null ? (
        <Caution
          action={
            <Link
              className={buttonVariants({ size: "sm", variant: "outline" })}
              href={portfolio.href}
            >
              Upload on Portfolio
            </Link>
          }
          id={cautionId}
          title="No portfolio file uploaded yet"
        >
          Upload a binary Portfolio Performance file on Portfolio to keep your
          target allocation synced.
        </Caution>
      ) : null;
    case "refused":
      return (
        <Caution id={cautionId} title="Portfolio file could not be synced">
          {portfolioStatus.reason}
        </Caution>
      );
    case "retargeted":
    case "synced":
      return null;
    case "unsynced": {
      if (targets === null) {
        return null;
      }
      if (portfolioStatus.blockedReason !== undefined) {
        return (
          <Caution id={cautionId} title="Portfolio file has unsynced changes">
            {portfolioStatus.blockedReason}
          </Caution>
        );
      }
      return isInScenario ? (
        <Caution
          id={cautionId}
          title="Portfolio file has newer holdings or categories"
        >
          Syncing pulls the household&apos;s latest holdings and target weights
          into this scenario.
        </Caution>
      ) : (
        <Caution
          id={cautionId}
          title="Portfolio file has newer targets or holdings"
        >
          Sync from Portfolio to update this plan.
        </Caution>
      );
    }
  }
}

// Empty state inside the card before any target allocation is synced.
function emptyStateOf(
  status: PortfolioTargetStatus,
  branch: null | string,
  textId: string,
): JSX.Element {
  if (status.kind === "missing") {
    return (
      <EmptyState
        description="Upload a binary Portfolio Performance file on Portfolio to load your target allocation."
        icon={ChartPie}
        textId={textId}
        title="No portfolio file uploaded"
      >
        <Link className={buttonVariants({ size: "sm" })} href={portfolio.href}>
          Upload on Portfolio
        </Link>
      </EmptyState>
    );
  }
  if (status.kind === "refused") {
    return (
      <EmptyState
        description="Fix the file on Portfolio to load your target allocation."
        icon={ChartPie}
        textId={textId}
        title="Allocation could not be read"
      >
        <Link
          className={buttonVariants({ size: "sm", variant: "outline" })}
          href={portfolio.href}
        >
          Open Portfolio
        </Link>
      </EmptyState>
    );
  }
  return (
    <EmptyState
      description="Sync the Asset Allocation taxonomy from your portfolio file."
      icon={ChartPie}
      textId={textId}
      title="No allocation synced yet"
    >
      <PortfolioSync branch={branch} variant="default" />
    </EmptyState>
  );
}

// What says a fund holding no bonds sets the plan's split aside, and how
// much the plan holds in bonds now, or nothing where the fund is laid at
// the plan's split or the plan has none of its own.
function flagOf(fund: Fund, split: Allocation | null): string | undefined {
  return split === null || splitFor(fund, split).stocks === split.stocks
    ? undefined
    : `Holds no bonds; the plan holds ${formatWholePercent(1 - split.stocks)} now`;
}

// Footer provenance line naming the owned portfolio file and describing
// where retargeting writes.
function footerCopyOf(
  status: PortfolioTargetStatus,
  isInScenario: boolean,
): string {
  if (status.kind === "missing") {
    return "Upload a portfolio file on Portfolio to feed the target allocation.";
  }
  return isInScenario
    ? `Read from ${status.fileName} on Portfolio. Retargeting updates this scenario only; making it the household updates the portfolio file.`
    : `Read from ${status.fileName} on Portfolio. Retargeting updates its Asset Allocation weights in place.`;
}

// What a split reads as, "90% equity and 10% bonds".
function splitSaid({ stocks }: Allocation): string {
  return `${formatWholePercent(stocks)} equity and ${formatWholePercent(1 - stocks)} bonds`;
}
