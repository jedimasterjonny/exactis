"use client";

import type { JSX } from "react";

import { cn } from "cn";
import { ChartPie, Download, Sheet } from "lucide-react";
import { useId, useOptimistic } from "react";

import type { Blend, Deductions, Mapping, Vintages } from "@/data/cma";
import type { Targets } from "@/data/targets";

import { pullCma } from "@/actions/cma";
import { saveDeductions } from "@/actions/plan";
import { Caution } from "@/components/app/atoms/caution";
import { EmptyState } from "@/components/app/atoms/empty-state";
import { FieldRow } from "@/components/app/atoms/field-row";
import { Ledger } from "@/components/app/atoms/ledger";
import { Note } from "@/components/app/atoms/note";
import { RateField } from "@/components/app/molecules/figure-field";
import { SectionCard } from "@/components/app/molecules/section-card";
import { Badge } from "@/components/kit/badge";
import { Button } from "@/components/kit/button";
import { CardContent, CardFooter } from "@/components/kit/card";
import { blendsOf, cmaRates, vintageMonth, vintageName } from "@/data/cma";
import { useSender } from "@/hooks/use-sender";
import { formatCurveRate, formatPercent, formatPoints } from "@/lib/money";
import { formatDay } from "@/lib/months";
import { assumptions, subsectionLabel } from "@/lib/nav";

interface ReturnSourceProps {
  readonly cma: null | Vintages;
  readonly deductions: Deductions;
  readonly mappings: readonly Mapping[];
  readonly targets: null | Targets;
}

// What a sleeve's ledger is headed and closes on, and what its fee
// step rests on: stocks' fees are the ones typed, and bonds' the same
// figure again.
const sleeves = {
  bonds: {
    fees: "Same basis as equities",
    heading: "Bonds",
    total: "Bonds growth",
  },
  stocks: {
    fees: "Fund OCFs plus platform charge",
    heading: "Equities",
    total: "Stocks growth",
  },
} as const;

// The assumptions screen's return source: the latest vintage of
// BlackRock's capital market assumptions, blended by the target
// allocation into the growth the CMA-derived rates take, laid out step
// by step so each figure can be checked. The header names the vintage
// and pulls BlackRock's latest workbook; the pull holds while it is on
// its way, and the store's answer draws the screen again from the
// vintage kept, under a toast, or says why under a toast when BlackRock
// or its workbook is refused.
//
// The two deductions are typed at the head of the card, the fee drag off
// both sleeves and the dividend yield split out of stocks, since
// BlackRock's index returns carry no fees and its workbook no yields.
// Each is saved as the focus leaves it, alone, and one typed back to
// what it was is not sent; the ledgers follow it at once while the
// store is asked, and the store's answer draws the screen again, under
// a toast, or puts it back and says why.
//
// Beneath, a ledger a sleeve: the blended 20-year return, the hedging
// adjustment where a class in the sleeve is hedged to sterling, the
// fees, and for stocks the yield split out, each closing on the growth
// the rates take. Every step is one the growth is worked out from, so
// the steps add up to it. Beside them, on a sunken panel, every category's share of
// the whole. Before a vintage is pulled, or a target allocation imported
// on its tab, there is nothing to blend, and the card says so; while the
// vintage makes no blend, it says what is missing in the caution tone.
// The footer states what the figures are.
export function ReturnSource({
  cma,
  deductions,
  mappings,
  targets,
}: ReturnSourceProps): JSX.Element {
  const [shown, show] = useOptimistic(
    deductions,
    (current: Deductions, patch: Partial<Deductions>) => ({
      ...current,
      ...patch,
    }),
  );
  const { isSending: isPulling, send: sendPull } = useSender();
  const { send } = useSender();

  function pull(): void {
    sendPull(pullCma, {
      failure: "CMA not pulled",
      success: (pulled) => ({
        description: `${vintageName(pulled)}, data as of ${formatDay(pulled.asOf)}`,
        title: "CMA pulled",
      }),
    });
  }

  function save(key: keyof Deductions, value: number): void {
    if (formatPercent(value) === formatPercent(shown[key])) {
      return;
    }
    const patch = { [key]: value };
    send(
      async () => {
        show(patch);
        return saveDeductions(patch);
      },
      {
        failure: "Deductions not saved",
        success: (saved) => ({
          description: `Fees ${formatPercent(saved.fees)} · dividend yield ${formatPercent(saved.dividends)}`,
          title: "Deductions saved",
        }),
      },
    );
  }

  return (
    <SectionCard
      actions={
        <>
          {cma !== null && (
            <Badge className="label" variant="secondary">
              <Sheet aria-hidden />
              {`BlackRock CMA · ${vintageMonth(cma.latest)}`}
            </Badge>
          )}
          <Button
            disabled={isPulling}
            onClick={pull}
            size="sm"
            variant="outline"
          >
            <Download aria-hidden />
            Pull CMA workbook
          </Button>
        </>
      }
      label={subsectionLabel(assumptions, 2)}
      title="Return source"
    >
      <CardContent className="grid gap-8">
        <FieldRow layout="pair">
          <RateField
            hint="Fund OCFs plus platform charge, off both sleeves"
            label="Fee drag"
            min={0}
            onValueCommitted={(value) => {
              save("fees", value);
            }}
            value={shown.fees}
          />
          <RateField
            hint="Split out of stocks' return and added back on top"
            label="Dividend yield"
            min={0}
            onValueCommitted={(value) => {
              save("dividends", value);
            }}
            value={shown.dividends}
          />
        </FieldRow>
        {cma === null && (
          <EmptyState
            description="Pull BlackRock's workbook to blend its 20-year GBP returns by your target allocation."
            icon={Sheet}
            title="No CMA pulled yet"
          />
        )}
        {cma !== null && targets === null && (
          <EmptyState
            description="Import a target allocation on its tab to weight the CMA's returns by."
            icon={ChartPie}
            title="No allocation imported yet"
          />
        )}
        {cma !== null && targets !== null && (
          <Blended
            deductions={shown}
            mappings={mappings}
            targets={targets}
            vintages={cma}
          />
        )}
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        {`${cma === null ? "GBP rows, 20-year column" : asOf(cma)}. Figures are nominal. Growth and dividend yield are added — never change one without the other.`}
      </CardFooter>
    </SectionCard>
  );
}

// Which figures of the latest vintage the card reads, and the day
// they are as of.
function asOf({ latest }: Vintages): string {
  return `GBP rows, 20-year column, data as of ${formatDay(latest.asOf)}`;
}

// The latest vintage's blends as a ledger a sleeve beside the weights
// they are blended by, or what keeps them from being blended.
function Blended({
  deductions,
  mappings,
  targets,
  vintages,
}: {
  readonly deductions: Deductions;
  readonly mappings: readonly Mapping[];
  readonly targets: Targets;
  readonly vintages: Vintages;
}): JSX.Element {
  const blends = blendsOf(vintages.latest, targets, mappings);
  if ("short" in blends) {
    return (
      <Caution title="The CMA cannot be blended yet">
        {`${blends.short}. Set it right on the Target allocation tab, and the rates are derived again.`}
      </Caution>
    );
  }
  const rates = cmaRates(blends, deductions, 0);
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,18rem)]">
      <Sleeve
        blend={blends.stocks}
        deductions={deductions}
        detail="Weighted by target allocation"
        sleeve="stocks"
        total={rates.stocks}
      />
      <Sleeve
        blend={blends.bonds}
        deductions={deductions}
        detail={largestOf(blends.bonds)}
        sleeve="bonds"
        total={rates.bonds}
      />
      <Weights targets={targets} />
    </div>
  );
}

// What the bonds' blend rests on: the category weighing most in it and
// how much, which a blend always has, since a sleeve with nothing in it
// makes none.
function largestOf({ parts }: Blend): string {
  return [...parts]
    .sort((one, other) => other.weight - one.weight)
    .slice(0, 1)
    .map(
      ({ category, weight }) =>
        `${category.name} ${formatPercent(weight)} of the sleeve`,
    )
    .join("");
}

// A sleeve's ledger under its heading, from the blended return to the
// growth the rates take, or a note that nothing blends into the sleeve,
// whose rate stands in at the other's and weighs nothing.
function Sleeve({
  blend,
  deductions,
  detail,
  sleeve,
  total,
}: {
  readonly blend: Blend;
  readonly deductions: Deductions;
  readonly detail: string;
  readonly sleeve: keyof typeof sleeves;
  readonly total: number;
}): JSX.Element {
  const id = useId();
  const words = sleeves[sleeve];
  const isHedged = blend.parts.some(({ asset }) => asset.hedges !== undefined);
  return (
    <section aria-labelledby={id} className="grid content-start gap-4">
      <h3 className="label text-muted-foreground" id={id}>
        {words.heading}
      </h3>
      {blend.parts.length === 0 ? (
        <Note>{`Nothing in the target allocation blends into ${sleeve}`}</Note>
      ) : (
        <Ledger
          steps={[
            {
              detail,
              figure: formatCurveRate(blend.rate),
              label: "Blended 20y GBP return",
            },
            ...(isHedged
              ? [
                  {
                    detail: "Carried from US to UK cash, 20y point",
                    figure: formatPoints(blend.hedging),
                    label: "GBP-hedging adjustment",
                  },
                ]
              : []),
            {
              detail: words.fees,
              figure: formatPoints(-deductions.fees),
              label: "Fee drag",
            },
            ...(sleeve === "stocks"
              ? [
                  {
                    detail: "Entered separately and added back",
                    figure: formatPoints(-deductions.dividends),
                    label: "Dividend yield, split out",
                  },
                ]
              : []),
          ]}
          total={formatPercent(total)}
          totalName={words.total}
        />
      )}
    </section>
  );
}

// Every category's share of the whole, on a sunken panel headed as a
// region of its own, a share of nothing muted, and where the shares
// come from beneath.
function Weights({ targets }: { readonly targets: Targets }): JSX.Element {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="grid gap-4 self-start rounded-lg bg-muted p-5"
    >
      <h3 className="label text-muted-foreground" id={id}>
        Target weights
      </h3>
      <dl className="grid gap-3">
        {targets.categories.map(({ id: category, name, share }) => {
          const tone = share === 0 ? "text-muted-foreground" : undefined;
          return (
            <div className="flex justify-between gap-4" key={category}>
              <dt className={tone}>{name}</dt>
              <dd className={cn("figure", tone)}>{formatPercent(share)}</dd>
            </div>
          );
        })}
      </dl>
      <p className="text-sm text-muted-foreground">
        From the Target allocation tab — portfolio targets, not current
        holdings.
      </p>
    </section>
  );
}
